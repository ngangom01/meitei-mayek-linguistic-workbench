import JSZip from 'jszip'
import { db } from './db'

async function saveOrShare(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'application/zip' })
  try {
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: filename, text: 'Meitei Mayek linguistic review package' })
      return
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    // If native sharing fails, fall through to a download.
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function exportWorkspaceBackup() {
  const zip = new JSZip()
  const items = await db.items.toArray()
  const audio = await db.audio.toArray()
  zip.file('workspace/items.json', JSON.stringify(items, null, 2))
  const audioIndex = []
  for (const sample of audio) {
    const path = `workspace/audio/${sample.id}`
    zip.file(path, sample.blob)
    audioIndex.push({
      id: sample.id, itemId: sample.itemId, path,
      mimeType: sample.mimeType, durationMs: sample.durationMs, createdAt: sample.createdAt
    })
  }
  zip.file('workspace/audio-index.json', JSON.stringify(audioIndex, null, 2))
  zip.file('README.txt', 'Private Workbench backup. Import support is a planned next step; keep this file safe.')
  const blob = await zip.generateAsync({ type: 'blob' })
  await saveOrShare(blob, `Meitei_Workbench_Backup_${new Date().toISOString().slice(0, 10)}.zip`)
}

export async function exportReviewPackage(items: unknown[]) {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({
    packageType: 'workbench-review-starter',
    packageVersion: 1,
    createdAt: new Date().toISOString(),
    note: 'Starter transport envelope only. Replace content mapping with the approved Academy schema before real submissions.'
  }, null, 2))
  zip.file('content/review-items.json', JSON.stringify(items, null, 2))
  zip.file('review/README.txt', 'This is not yet an Academy-importable submission. Connect the approved Academy schema adapter before expert use.')
  const blob = await zip.generateAsync({ type: 'blob' })
  await saveOrShare(blob, `Meitei_Review_Submission_${new Date().toISOString().slice(0, 10)}.zip`)
}
