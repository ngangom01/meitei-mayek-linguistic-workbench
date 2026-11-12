import JSZip from 'jszip'
import { db, normalizeReviewItem, type AudioSample, type ReviewItem } from './db'

async function shareOrDownload(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: 'application/zip' })
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text: 'Meitei Mayek linguistic review files' })
      return
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

async function getAudioIndex(itemIds?: Set<string>) {
  const samples = itemIds
    ? await db.audio.where('itemId').anyOf(Array.from(itemIds)).toArray()
    : await db.audio.toArray()
  const index: Array<{ id: string; itemId: string; path: string; mimeType: string; durationMs: number; createdAt: string; label: string }> = []
  for (const sample of samples) {
    const path = 'audio/' + sample.id + '.bin'
    index.push({
      id: sample.id, itemId: sample.itemId, path, mimeType: sample.mimeType,
      durationMs: sample.durationMs, createdAt: sample.createdAt, label: sample.label
    })
  }
  return { samples, index }
}

export async function exportWorkspaceBackup() {
  const zip = new JSZip()
  const items = await db.items.toArray()
  const result = await getAudioIndex()
  for (let i = 0; i < result.samples.length; i++) zip.file(result.index[i].path, result.samples[i].blob)
  zip.file('manifest.json', JSON.stringify({
    packageType: 'mayek-workbench-backup',
    packageVersion: 1,
    createdAt: new Date().toISOString(),
    itemCount: items.length,
    audioCount: result.index.length
  }, null, 2))
  zip.file('items.json', JSON.stringify(items, null, 2))
  zip.file('audio-index.json', JSON.stringify(result.index, null, 2))
  zip.file('README.txt', 'Complete local Workbench backup. Keep this file safe. Import it into the Workbench to restore items and recordings.')
  const blob = await zip.generateAsync({ type: 'blob' })
  const date = new Date().toISOString().slice(0, 10)
  await shareOrDownload(blob, 'Meitei_Workbench_Backup_' + date + '.zip', 'Workbench backup')
}

export async function exportReviewPackage(items: ReviewItem[]) {
  const zip = new JSZip()
  const result = await getAudioIndex(new Set(items.map(item => item.id)))
  for (let i = 0; i < result.samples.length; i++) zip.file(result.index[i].path, result.samples[i].blob)
  zip.file('manifest.json', JSON.stringify({
    packageType: 'mayek-linguistic-review-submission',
    packageVersion: 1,
    createdAt: new Date().toISOString(),
    itemCount: items.length,
    audioCount: result.index.length,
    compatibility: 'Workbench transport format; not a direct Academy import file.'
  }, null, 2))
  zip.file('review-items.json', JSON.stringify(items, null, 2))
  zip.file('audio-index.json', JSON.stringify(result.index, null, 2))
  zip.file('README.txt', [
    'MEITEI MAYEK LINGUISTIC REVIEW SUBMISSION',
    '',
    'This package contains expert review fields and the associated original audio recordings.',
    'This is a Workbench transport package, not a direct Academy import file.',
    'The Academy owner must validate the content and map approved changes to the Academy schema.'
  ].join('\n'))
  const blob = await zip.generateAsync({ type: 'blob' })
  const date = new Date().toISOString().slice(0, 10)
  await shareOrDownload(blob, 'Meitei_Review_Submission_' + date + '.zip', 'Review submission')
}

export async function importReviewItemsJson(file: File) {
  const parsed: unknown = JSON.parse(await file.text())
  let rawItems: unknown
  if (Array.isArray(parsed)) rawItems = parsed
  else if (parsed && typeof parsed === 'object') {
    const root = parsed as Record<string, unknown>
    if (root.format && root.format !== 'mayek-workbench-items') {
      throw new Error('This JSON file is not in the Workbench items format.')
    }
    rawItems = root.items
  }
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('The JSON file must contain a non-empty items array.')
  }
  const normalized = rawItems.map(normalizeReviewItem)
  if (normalized.some(item => item === null)) {
    throw new Error('One or more records are missing a stable string ID. No records were imported.')
  }
  const valid = normalized as ReviewItem[]
  const ids = new Set<string>()
  for (const item of valid) {
    if (ids.has(item.id)) throw new Error('The import file contains duplicate record IDs. No records were imported.')
    ids.add(item.id)
  }

  let added = 0
  let skipped = 0
  await db.transaction('rw', db.items, async () => {
    for (const item of valid) {
      if (await db.items.get(item.id)) { skipped++; continue }
      await db.items.add(item)
      added++
    }
  })
  return { added, skipped }
}

export async function restoreWorkspaceBackup(file: File) {
  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file('manifest.json')
  const itemsFile = zip.file('items.json')
  if (!manifestFile || !itemsFile) throw new Error('This ZIP does not look like a Workbench backup.')
  const manifest = JSON.parse(await manifestFile.async('string')) as Record<string, unknown>
  if (manifest.packageType !== 'mayek-workbench-backup' || manifest.packageVersion !== 1) {
    throw new Error('Unsupported backup type or version.')
  }

  const rawItems: unknown = JSON.parse(await itemsFile.async('string'))
  if (!Array.isArray(rawItems)) throw new Error('The backup item list is invalid.')
  const normalized = rawItems.map(normalizeReviewItem)
  if (normalized.some(item => item === null)) throw new Error('The backup contains an invalid item record.')
  const items = normalized as ReviewItem[]

  const audioIndexFile = zip.file('audio-index.json')
  const rawIndex: unknown = audioIndexFile ? JSON.parse(await audioIndexFile.async('string')) : []
  if (!Array.isArray(rawIndex)) throw new Error('The backup audio index is invalid.')

  // Decompress archive entries before opening the IndexedDB transaction.
  const audioRecords: AudioSample[] = []
  let skippedAudio = 0
  for (const entry of rawIndex as Array<Record<string, unknown>>) {
    if (typeof entry.id !== 'string' || typeof entry.itemId !== 'string' ||
        typeof entry.path !== 'string' || !entry.path.startsWith('audio/') || entry.path.includes('..')) {
      skippedAudio++
      continue
    }
    const audioFile = zip.file(entry.path)
    if (!audioFile) { skippedAudio++; continue }
    const blob = await audioFile.async('blob')
    const mimeType = typeof entry.mimeType === 'string' ? entry.mimeType : blob.type
    audioRecords.push({
      id: entry.id,
      itemId: entry.itemId,
      blob: new Blob([blob], { type: mimeType }),
      mimeType,
      durationMs: typeof entry.durationMs === 'number' ? entry.durationMs : 0,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
      label: typeof entry.label === 'string' ? entry.label : 'Restored pronunciation sample'
    })
  }

  let addedItems = 0
  let skippedItems = 0
  let addedAudio = 0
  await db.transaction('rw', db.items, db.audio, async () => {
    for (const item of items) {
      if (await db.items.get(item.id)) { skippedItems++; continue }
      await db.items.add(item)
      addedItems++
    }
    for (const sample of audioRecords) {
      if (await db.audio.get(sample.id) || !(await db.items.get(sample.itemId))) {
        skippedAudio++
        continue
      }
      await db.audio.add(sample)
      addedAudio++
    }
  })
  return { addedItems, skippedItems, addedAudio, skippedAudio }
}
