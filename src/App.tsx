import { useEffect, useMemo, useRef, useState } from 'react'
import { db, normalizeReviewItem, type AudioSample, type ReviewItem, type ReviewStatus } from './db'
import { exportWorkspaceBackup, exportReviewPackage, importReviewItemsJson, restoreWorkspaceBackup } from './export'

type Tab = 'home' | 'review' | 'share'
const statusLabels: Record<ReviewStatus, string> = {
  not_reviewed: 'Not reviewed',
  in_progress: 'In progress',
  needs_clarification: 'Needs clarification',
  reviewed: 'Reviewed'
}

function AudioRow({ sample, onDelete }: { sample: AudioSample; onDelete: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const objectUrl = URL.createObjectURL(sample.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [sample.blob])
  return <div className="audio-row">
    <div className="audio-meta"><strong>{sample.label || 'Pronunciation sample'}</strong><span>{Math.max(1, Math.round(sample.durationMs / 1000))} sec · {new Date(sample.createdAt).toLocaleString()}</span></div>
    {url && <audio controls preload="metadata" src={url}>Audio playback is not supported by this browser.</audio>}
    <button className="quiet danger" onClick={onDelete}>Delete</button>
  </div>
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [audioSamples, setAudioSamples] = useState<AudioSample[]>([])
  const [totalAudioCount, setTotalAudioCount] = useState(0)
  const [selected, setSelected] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [message, setMessage] = useState('Your reviews and recordings stay in this browser on this device.')
  const [recording, setRecording] = useState(false)
  const [requestingRecording, setRequestingRecording] = useState(false)
  const [microphoneReady, setMicrophoneReady] = useState(false)
  const [checkingMicrophone, setCheckingMicrophone] = useState(true)
  const [preparingMicrophone, setPreparingMicrophone] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const recordingIntentRef = useRef(false)
  const recordPressActiveRef = useRef(false)
  const importItemsRef = useRef<HTMLInputElement>(null)
  const restoreBackupRef = useRef<HTMLInputElement>(null)

  async function refreshItems() {
    const rows = await db.items.orderBy('updatedAt').reverse().toArray()
    setItems(rows)
    setSelected(current => rows.some(row => row.id === current) ? current : (rows[0]?.id || ''))
    setTotalAudioCount(await db.audio.count())
  }

  useEffect(() => {
    let cancelled = false
    async function initialiseWorkspace() {
      try {
        let retiredRemoved = 0
        // Remove the video and BOSEM chapter queue from older local Workbench
        // versions without touching the character records or other expert work.
        await db.transaction('rw', db.items, db.audio, async () => {
          const existingItems = await db.items.toArray()
          const recordedItemIds = new Set((await db.audio.toArray()).map(sample => sample.itemId))
          for (const item of existingItems) {
            const isRetiredSource = item.id.startsWith('source.video.') ||
              item.id.startsWith('lesson.bosem.class1.chapter-')
            if (isRetiredSource) {
              await db.audio.where('itemId').equals(item.id).delete()
              await db.items.delete(item.id)
              retiredRemoved++
              continue
            }
            // Existing browser recordings also count as completed character audio.
            if (!item.id.startsWith('task.') && recordedItemIds.has(item.id) &&
              (item.reviewStatus !== 'reviewed' || item.audioReviewStatus !== 'accepted')) {
              await db.items.update(item.id, { reviewStatus: 'reviewed', audioReviewStatus: 'accepted' })
            }
            let category = item.category
            if (category === 'Core letter') category = 'Core letters'
            if (category === 'Lonsum letter') category = 'Lonsum / consonants'
            if (category === 'Dependent vowel sign') category = 'Cheitap / vowels'
            if (category !== item.category) {
              await db.items.update(item.id, { category, updatedAt: item.updatedAt })
            }
          }
        })

        const seedMarker = await db.settings.get('review-seed-v2')
        if (!seedMarker) {
          const response = await fetch(import.meta.env.BASE_URL + 'review-items.json')
          if (!response.ok) throw new Error('The review dataset could not be downloaded (HTTP ' + response.status + ').')
          const payload: unknown = await response.json()
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('The review dataset has an invalid structure.')
          }
          const root = payload as Record<string, unknown>
          if (root.format !== 'mayek-workbench-items' || !Array.isArray(root.items) || root.items.length === 0) {
            throw new Error('The review dataset format or item list is invalid.')
          }
          const normalized = root.items.map(normalizeReviewItem)
          if (normalized.some(item => item === null)) {
            throw new Error('The review dataset contains an invalid record. No items were loaded.')
          }
          const seedItems = normalized as ReviewItem[]
          const ids = new Set<string>()
          for (const item of seedItems) {
            if (ids.has(item.id)) throw new Error('The review dataset contains duplicate IDs. No items were loaded.')
            ids.add(item.id)
          }
          let inserted = 0
          await db.transaction('rw', db.items, db.settings, async () => {
            for (const item of seedItems) {
              if (await db.items.get(item.id)) continue
              await db.items.add(item)
              inserted++
            }
            await db.settings.put({ key: 'review-seed-v2', value: String(seedItems.length) })
          })
          await refreshItems()
          if (!cancelled) {
            setMessage(retiredRemoved > 0
              ? 'Review queue updated: removed ' + retiredRemoved + ' retired video/chapter item(s) and preserved the remaining local reviews.'
              : 'Preloaded ' + inserted + ' review item(s) from the project dataset. Existing local items were kept unchanged.')
          }
        } else {
          await refreshItems()
          if (retiredRemoved > 0 && !cancelled) {
            setMessage('Review queue updated: removed ' + retiredRemoved + ' retired video/chapter item(s) and preserved the remaining local reviews.')
          }
        }
      } catch (error) {
        await refreshItems()
        if (!cancelled) {
          setMessage(error instanceof Error
            ? 'The starter review dataset could not be loaded: ' + error.message + ' You can still create items or import a JSON file.'
            : 'The starter review dataset could not be loaded. You can still create items or import a JSON file.')
        }
      }
    }
    void initialiseWorkspace()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    let permissionStatus: PermissionStatus | undefined
    async function checkMicrophonePermission() {
      try {
        if (navigator.permissions?.query) {
          permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName })
          if (!cancelled) setMicrophoneReady(permissionStatus.state === 'granted')
          permissionStatus.onchange = () => {
            if (!cancelled) setMicrophoneReady(permissionStatus?.state === 'granted')
          }
        }
      } catch {
        // The permission query is not supported in every browser; the user can
        // still grant microphone access through the explicit setup button.
      } finally {
        if (!cancelled) setCheckingMicrophone(false)
      }
    }
    void checkMicrophonePermission()
    return () => {
      cancelled = true
      if (permissionStatus) permissionStatus.onchange = null
    }
  }, [])

  useEffect(() => {
    if (!selected) {
      setAudioSamples([])
      return
    }
    let cancelled = false
    void db.audio.where('itemId').equals(selected).sortBy('createdAt').then(rows => {
      if (!cancelled) setAudioSamples(rows)
    })
    return () => { cancelled = true }
  }, [selected])

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  const active = items.find(item => item.id === selected)
  const isCombinationTask = active?.id === 'task.combinations.syllables'
  const isPronunciationTask = active?.id === 'task.pronunciation.audio'
  const isCharacterRecord = Boolean(active && !isCombinationTask && !isPronunciationTask)
  const recordingBusy = recording || requestingRecording || preparingMicrophone
  const categories = useMemo(() => [...new Set(items.map(item => item.category).filter(Boolean))].sort(), [items])
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return items.filter(item => {
      const searchable = [item.id, item.glyph, item.displayLabel, item.category, item.letterName, item.pronunciation]
      const matchesText = !query || searchable.some(value => value.toLocaleLowerCase().includes(query))
      const matchesStatus = statusFilter === 'all' || item.reviewStatus === statusFilter
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter
      return matchesText && matchesStatus && matchesCategory
    })
  }, [items, search, statusFilter, categoryFilter])

  async function updateItem(id: string, patch: Partial<ReviewItem>) {
    const current = await db.items.get(id)
    if (!current) return
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() }
    if (id === 'task.combinations.syllables' && ('syllableExamples' in patch || 'sourceReference' in patch)) {
      const hasCombinations = Boolean(updated.syllableExamples.trim())
      const source = updated.sourceReference.trim()
      const hasRealSource = Boolean(source) && !source.startsWith('Expert to cite')
      updated.reviewStatus = hasCombinations && hasRealSource ? 'reviewed' : (hasCombinations || hasRealSource ? 'in_progress' : 'not_reviewed')
    }
    await db.items.put(updated)
    setItems(rows => rows.map(row => row.id === id ? updated : row).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    setMessage('✓ Changes saved on this device.')
  }

  async function addBlankItem() {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const item: ReviewItem = {
      id, category: '', glyph: '', unicodeSequence: '', displayLabel: 'New review item',
      letterName: '', pronunciation: '', writingNotes: '', syllableExamples: '',
      variantNotes: '', sourceReference: '', reviewStatus: 'not_reviewed', audioReviewStatus: 'not_reviewed',
      expertNotes: '', createdAt: now, updatedAt: now
    }
    await db.items.add(item)
    setItems(rows => [item, ...rows])
    setSelected(id)
    setTab('review')
    setMessage('New local review item created. Enter the source details; do not guess linguistic values.')
  }

  async function deleteItem(item: ReviewItem) {
    if (!window.confirm('Delete "' + item.displayLabel + '" and its attached recordings from this device?')) return
    await db.transaction('rw', db.items, db.audio, async () => {
      await db.items.delete(item.id)
      await db.audio.where('itemId').equals(item.id).delete()
    })
    setSelected('')
    await refreshItems()
    setMessage('Review item and its recordings were deleted from this device.')
  }

  async function deleteAudio(sample: AudioSample) {
    if (!window.confirm('Delete this recording from this device?')) return
    await db.audio.delete(sample.id)
    const remainingSamples = await db.audio.where('itemId').equals(sample.itemId).count()
    if (remainingSamples === 0 && !sample.itemId.startsWith('task.')) {
      const item = await db.items.get(sample.itemId)
      if (item) {
        const resetItem = { ...item, reviewStatus: 'not_reviewed' as ReviewStatus, audioReviewStatus: 'not_reviewed' as ReviewItem['audioReviewStatus'], updatedAt: new Date().toISOString() }
        await db.items.put(resetItem)
        setItems(rows => rows.map(row => row.id === sample.itemId ? resetItem : row))
      }
    }
    setAudioSamples(rows => rows.filter(row => row.id !== sample.id))
    setTotalAudioCount(await db.audio.count())
    setMessage(remainingSamples === 0 && !sample.itemId.startsWith('task.')
      ? 'Recording deleted. This character is marked as awaiting a recording.'
      : 'Recording deleted from this device.')
  }

  async function prepareMicrophone() {
    if (preparingMicrophone || microphoneReady) return
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage('Audio recording is not supported by this browser. Use a current Chrome, Edge or Safari browser over HTTPS.')
      return
    }
    setPreparingMicrophone(true)
    setMessage('Allow microphone access in the browser prompt. This setup is needed only once on this device.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      setMicrophoneReady(true)
      setMessage('Microphone ready. Press and hold the recording button; release it to stop and save the sample.')
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      setMessage(name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow it in the site permissions beside the browser address bar, then try again.'
        : 'Could not access the microphone. Check that it is connected and not being used by another app.')
    } finally {
      setPreparingMicrophone(false)
    }
  }

  async function startRecording() {
    if (!active || recording || requestingRecording || recordingIntentRef.current) return
    if (!microphoneReady) {
      setMessage('Enable microphone access before recording.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage('Audio recording is not supported by this browser. Use a current Chrome, Edge or Safari browser over HTTPS.')
      return
    }
    recordingIntentRef.current = true
    setRequestingRecording(true)
    setMessage('Starting microphone… keep holding the button.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!recordingIntentRef.current) {
        stream.getTracks().forEach(track => track.stop())
        setRequestingRecording(false)
        return
      }
      const supportedTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const mimeType = supportedTypes.find(type => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: BlobPart[] = []
      const itemId = active.id
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = () => setMessage('The browser reported an audio recording error.')
      recorder.onstop = async () => {
        const durationMs = Math.max(0, Date.now() - startedAtRef.current)
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'application/octet-stream' })
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
        recorderRef.current = null
        recordingIntentRef.current = false
        recordPressActiveRef.current = false
        setRecording(false)
        setRequestingRecording(false)
        if (blob.size > 0) {
          const count = await db.audio.where('itemId').equals(itemId).count()
          const sample: AudioSample = {
            id: crypto.randomUUID(), itemId, blob, mimeType: blob.type,
            durationMs, createdAt: new Date().toISOString(),
            label: 'Pronunciation ' + (count + 1)
          }
          await db.audio.add(sample)
          if (!itemId.startsWith('task.')) {
            const item = await db.items.get(itemId)
            if (item) {
              const reviewedItem = { ...item, reviewStatus: 'reviewed' as ReviewStatus, audioReviewStatus: 'accepted' as ReviewItem['audioReviewStatus'], updatedAt: new Date().toISOString() }
              await db.items.put(reviewedItem)
              setItems(rows => rows.map(row => row.id === itemId ? reviewedItem : row))
            }
          }
          if (selected === itemId) setAudioSamples(await db.audio.where('itemId').equals(itemId).sortBy('createdAt'))
          setTotalAudioCount(await db.audio.count())
          setMessage('Recording saved locally. Play it back to check the sound.')
        } else {
          setMessage('No audio data was captured. Please hold the button a little longer and try again.')
        }
      }
      streamRef.current = stream
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      recorder.start()
      setRequestingRecording(false)
      setRecording(true)
      setMessage('Recording… release the button to stop and save.')
    } catch (error) {
      recordingIntentRef.current = false
      recordPressActiveRef.current = false
      setRequestingRecording(false)
      setRecording(false)
      const name = error instanceof DOMException ? error.name : ''
      setMessage(name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow microphone access in your browser settings and try again.'
        : 'Could not start the microphone. Check that it is connected and not being used by another app.')
    }
  }

  function stopRecording() {
    const wasStarting = recordingIntentRef.current && !recorderRef.current
    recordingIntentRef.current = false
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
      return
    }
    if (wasStarting) {
      setRequestingRecording(false)
      setMessage('Recording cancelled before the microphone was ready.')
    }
  }

  function endRecordingPress() {
    if (!recordPressActiveRef.current) return
    recordPressActiveRef.current = false
    stopRecording()
  }

  async function handleItemsImport(file?: File) {
    if (!file) return
    try {
      const result = await importReviewItemsJson(file)
      await refreshItems()
      setMessage('Imported ' + result.added + ' item(s). ' + result.skipped + ' duplicate ID(s) were left unchanged.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not import this JSON file.')
    }
  }

  async function handleBackupRestore(file?: File) {
    if (!file) return
    if (!window.confirm('Restore items and recordings from this backup? Existing records with the same IDs will be kept unchanged.')) return
    try {
      const result = await restoreWorkspaceBackup(file)
      await refreshItems()
      setMessage('Restored ' + result.addedItems + ' item(s) and ' + result.addedAudio + ' recording(s). Skipped ' + result.skippedItems + ' existing item(s) and ' + result.skippedAudio + ' recording(s).')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not restore this backup.')
    }
  }

  function downloadTemplate() {
    const template = {
      format: 'mayek-workbench-items',
      version: 1,
      items: [{
        id: 'replace-with-stable-source-record-id',
        category: '',
        glyph: '',
        unicodeSequence: '',
        displayLabel: '',
        letterName: '',
        pronunciation: '',
        writingNotes: '',
        syllableExamples: '',
        variantNotes: '',
        sourceReference: '',
        reviewStatus: 'not_reviewed',
        audioReviewStatus: 'not_reviewed',
        expertNotes: ''
      }]
    }
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'mayek-workbench-import-template.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function prepareSubmission() {
    if (items.length === 0) {
      setMessage('There are no review items to submit yet.')
      return
    }
    await exportReviewPackage(items)
    setMessage('Review package prepared. Share or send the ZIP to the Academy owner for validation.')
  }

  const reviewedCount = items.filter(item => item.reviewStatus === 'reviewed').length
  const needsAttention = items.filter(item => item.reviewStatus === 'needs_clarification').length

  return <main className="shell">
    <header className="topbar">
      <div className="brand-mark" aria-hidden="true">ꯃ</div>
      <div className="brand-title"><div className="eyebrow">MEITEI MAYEK ACADEMY · EXPERT TOOL</div><h1>Linguistic Review Workbench</h1><p>Review content, record pronunciation, return feedback.</p></div>
      <span className="local-tag"><span className="live-dot" /> Stored on this device</span>
    </header>

    <nav className="tabs" aria-label="Main navigation">
      <button disabled={recordingBusy} className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>Overview</button>
      <button disabled={recordingBusy} className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Review workspace <span className="count">{items.length}</span></button>
      <button disabled={recordingBusy} className={tab === 'share' ? 'active' : ''} onClick={() => setTab('share')}>Backup & share</button>
    </nav>

    <div className="status-message" role="status">{message}</div>

    {tab === 'home' && <section className="home-grid">
      <div className="panel hero">
        <p className="eyebrow">EXPERT WORKSPACE</p>
        <h2>One place to review<br />Meitei Mayek material.</h2>
        <p className="muted">Record one clear sound for each character, add a note only when something needs explanation, then return the audio package to the Academy owner.</p>
        <div className="actions">
          <button className="primary" onClick={() => setTab('review')}>Open review workspace <span aria-hidden="true">→</span></button>
          <button onClick={() => void addBlankItem()}>＋ New review item</button>
        </div>
        <div className="privacy-note"><strong>Private by design.</strong> Your drafts and recordings are kept in this browser on this device. Nothing is uploaded automatically.</div>
      </div>
      <div className="panel summary-panel">
        <p className="eyebrow">LOCAL REVIEW STATUS</p>
        <div className="metric-grid">
          <div><strong>{items.length}</strong><span>Total items</span></div>
          <div><strong>{reviewedCount}</strong><span>Reviewed</span></div>
          <div><strong>{needsAttention}</strong><span>Need clarification</span></div>
        </div>
        <div className="progress-track"><span style={{ width: items.length ? (Math.round(reviewedCount / items.length * 100) + '%') : '0%' }} /></div>
        <p className="small">{items.length ? (Math.round(reviewedCount / items.length * 100) + '% of items marked reviewed') : 'No review items loaded yet'}</p>
        <div className="home-shortcuts">
          <button onClick={() => importItemsRef.current?.click()}>Import review items (JSON)</button>
          <button onClick={downloadTemplate}>Download import template</button>
        </div>
      </div>
      <div className="panel guidance">
        <p className="eyebrow">HOW THE EXPERT WORKFLOW WORKS</p>
        <div className="step"><span>01</span><div><strong>Load assigned records</strong><p>Import a Workbench JSON file or create items manually. Keep the stable record ID supplied by the Academy.</p></div></div>
        <div className="step"><span>02</span><div><strong>Record the sound</strong><p>Each character and sign is already identified. One clear audio recording is the only required contribution.</p></div></div>
        <div className="step"><span>03</span><div><strong>Listen and add notes only if needed</strong><p>Replay the recording. Add another sample only for a meaningful variant; notes are optional.</p></div></div>
        <div className="step"><span>04</span><div><strong>Return your review</strong><p>Export a review ZIP and send it to the Academy owner. The owner validates and applies approved changes.</p></div></div>
      </div>
    </section>}

    {tab === 'review' && <section className="review-layout">
      <aside className="panel item-list">
        <div className="section-head"><div><p className="eyebrow">ASSIGNED MATERIAL</p><h2>Review items <span className="count">{items.length}</span></h2></div><button className="small-button" disabled={recordingBusy} onClick={() => void addBlankItem()}>＋ Add</button></div>
        <input className="search-input" aria-label="Search review items" placeholder="Search glyph, label or ID…" value={search} onChange={event => setSearch(event.target.value)} />
        <select className="filter-select" aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="all">All review statuses</option>
          <option value="not_reviewed">Not reviewed</option><option value="in_progress">In progress</option>
          <option value="needs_clarification">Needs clarification</option><option value="reviewed">Reviewed</option>
        </select>
        <select className="filter-select" aria-label="Filter by category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>
          {categories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
        {filteredItems.length === 0 && <div className="empty-list"><strong>{items.length ? 'No matching items' : 'No items yet'}</strong><p>{items.length ? 'Try another search or status filter.' : 'Import assigned items or create the first record.'}</p></div>}
        <div className="item-scroll">
          {filteredItems.map(item => <button key={item.id} className={'item-row ' + (selected === item.id ? 'chosen' : '')} disabled={recordingBusy} onClick={() => setSelected(item.id)}>
            <span className="item-glyph">{item.glyph || '—'}</span><span className="item-text"><strong>{item.displayLabel || 'Untitled item'}</strong><span>{item.category || 'Uncategorised'} · {item.id.slice(0, 12)}</span><em className={'status status-' + item.reviewStatus}>{statusLabels[item.reviewStatus]}</em></span>
          </button>)}
        </div>
        <div className="list-footer"><button className="text-button" onClick={() => importItemsRef.current?.click()}>Import JSON</button><button className="text-button" onClick={downloadTemplate}>Template</button></div>
      </aside>

      <section className="panel editor">
        {!active ? <div className="editor-empty"><div className="empty-symbol">ꯃ</div><h2>Select a review item</h2><p>Choose a record from the list or import assigned items.</p><button className="primary" onClick={() => void addBlankItem()}>Create review item</button></div> : <>
          <div className="editor-heading"><div><p className="eyebrow">RECORD REVIEW</p><h2>{active.glyph || active.displayLabel}</h2><p className="record-id">Record ID: <code>{active.id}</code></p></div><button className="quiet danger" disabled={recordingBusy} onClick={() => void deleteItem(active)}>Delete item</button></div>

          <div className="identity-strip">
            <div><span>{isCombinationTask || isPronunciationTask ? 'Review task' : 'Character / sign'}</span><strong className={isCharacterRecord ? 'large-glyph' : 'task-name'}>{isCharacterRecord ? (active.glyph || '—') : active.displayLabel}</strong></div>
            {isCharacterRecord && <div><span>Unicode reference</span><strong className="unicode">{active.unicodeSequence || 'Not supplied'}</strong></div>}
            {isCharacterRecord && <div className="reference-category"><span>Category</span><strong>{active.category}</strong></div>}
          </div>

          {isCharacterRecord && <>
            <div className="expert-instructions">
              <h3>What you need to do</h3>
              <ol>
                <li><strong>Record the sound.</strong> This is the only required contribution for this character.</li>
                <li><strong>Listen once.</strong> Keep the recording if it is clear; otherwise delete and record again.</li>
                <li><strong>Add a note only when needed.</strong> Mention a meaningful dialect difference, alternative sound or uncertainty.</li>
              </ol>
              <p>Character names, glyphs and Unicode references are supplied for identification. Please do not re-enter them.</p>
            </div>
            <div className="optional-notes">
              <label>Optional note — only for a variant or uncertainty
                <textarea rows={2} value={active.expertNotes} onChange={e => void updateItem(active.id, { expertNotes: e.target.value })} placeholder="For example: explain a pronunciation variant, dialect context or anything the recording cannot clarify." />
              </label>
            </div>
          </>}

          {isCombinationTask && <div className="task-form">
            <div className="expert-instructions">
              <h3>What you need to provide</h3>
              <ol>
                <li>Enter only combinations confirmed in a reliable Meitei teaching or linguistic source.</li>
                <li>Include the exact written form and the source page, chapter or link.</li>
                <li>Leave out combinations that are only technically possible but not verified.</li>
              </ol>
            </div>
            <label>Confirmed combinations
              <textarea rows={5} value={active.syllableExamples} onChange={e => void updateItem(active.id, { syllableExamples: e.target.value })} placeholder="Enter one source-confirmed combination per line. Include its exact Meitei Mayek form and any source-provided example or Roman form." />
            </label>
            <label>Source reference(s)
              <input value={active.sourceReference.startsWith('Expert to cite') ? '' : active.sourceReference} onChange={e => void updateItem(active.id, { sourceReference: e.target.value })} placeholder="Book title, author, page/chapter, or reliable URL" />
            </label>
            <label>Optional note — alternatives or unresolved cases
              <textarea rows={2} value={active.variantNotes} onChange={e => void updateItem(active.id, { variantNotes: e.target.value })} placeholder="Explain any uncertainty or accepted alternative, if relevant." />
            </label>
          </div>}

          {isPronunciationTask && <div className="task-form">
            <div className="expert-instructions">
              <h3>General pronunciation guidance (optional)</h3>
              <p>Individual character sounds should be recorded on their own character pages. Use this task only for general pronunciation rules, connected examples, or context-dependent patterns that do not belong to one character.</p>
            </div>
            <label>General pronunciation note
              <textarea rows={4} value={active.pronunciation} onChange={e => void updateItem(active.id, { pronunciation: e.target.value })} placeholder="Add a general rule or explanation only when it helps interpret the individual recordings." />
            </label>
            <label>Optional source reference
              <input value={active.sourceReference.startsWith('Expert to cite') ? '' : active.sourceReference} onChange={e => void updateItem(active.id, { sourceReference: e.target.value })} placeholder="Book, page, chapter, or reliable URL" />
            </label>
          </div>}

          {!isCombinationTask && <div className="recording-panel">
            <div className="section-head"><div><p className="eyebrow">{isCharacterRecord ? 'REQUIRED AUDIO' : 'OPTIONAL AUDIO'}</p><h3>{isCharacterRecord ? 'Record this character’s sound' : 'General pronunciation sample'}</h3></div><span className="count">{audioSamples.length} sample(s)</span></div>
            <p className="muted compact">{isCharacterRecord
              ? 'At least one clear sample is required for this character. Add another only for a meaningful pronunciation variant. Audio is saved locally.'
              : 'Use this only for a general spoken example that is not already covered by individual character recordings.'}</p>
            <div className="record-controls">
              {!microphoneReady ? <button
                type="button"
                className="mic-setup-button"
                disabled={checkingMicrophone || preparingMicrophone}
                onClick={() => void prepareMicrophone()}
              >
                <span className="record-dot" /> {preparingMicrophone ? 'Requesting microphone…' : checkingMicrophone ? 'Checking microphone…' : 'Enable microphone'}
              </button> : <button
                type="button"
                className={'record-button' + (recording ? ' is-recording' : '') + (requestingRecording ? ' is-requesting' : '')}
                aria-label={recording ? 'Release to stop recording' : 'Press and hold to record'}
                aria-pressed={recording || requestingRecording}
                onPointerDown={event => {
                  if (event.button !== 0 || recordPressActiveRef.current) return
                  recordPressActiveRef.current = true
                  try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture is an enhancement. */ }
                  if (!recordingBusy) void startRecording()
                }}
                onPointerUp={endRecordingPress}
                onPointerCancel={endRecordingPress}
                onLostPointerCapture={endRecordingPress}
                onKeyDown={event => {
                  if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && !recordPressActiveRef.current) {
                    event.preventDefault()
                    recordPressActiveRef.current = true
                    if (!recordingBusy) void startRecording()
                  }
                }}
                onKeyUp={event => {
                  if (event.key === ' ' || event.key === 'Enter') {
                    event.preventDefault()
                    endRecordingPress()
                  }
                }}
                onBlur={endRecordingPress}
              >
                <span className="record-dot" />
                {requestingRecording ? 'Starting recording…' : recording ? 'Release to stop' : 'Press and hold to record'}
              </button>}
            </div>
            <p className="record-hint">{microphoneReady
              ? 'Hold the button while speaking. Release anywhere to stop and save the recording.'
              : 'First time only: enable microphone access, then the press-and-hold recording control will appear.'}</p>
            {audioSamples.length > 0 ? <div className="audio-list">{audioSamples.map(sample => <AudioRow key={sample.id} sample={sample} onDelete={() => void deleteAudio(sample)} />)}</div> : <p className="audio-empty">{isCharacterRecord ? 'No sound recorded yet. One recording is required to complete this character.' : 'No general pronunciation sample attached. This is optional.'}</p>}
          </div>}

          <div className="editor-bottom"><span>✓ Changes save automatically on this device.</span><span>Last updated: {new Date(active.updatedAt).toLocaleString()}</span></div>
        </>}
      </section>
    </section>}

    {tab === 'share' && <section className="share-grid">
      <div className="panel">
        <p className="eyebrow">PORTABLE BACKUP</p><h2>Protect the expert's work</h2>
        <p className="muted">A backup includes all review items and every attached recording. Import it on another device to continue reviewing.</p>
        <div className="backup-stats"><span><strong>{items.length}</strong> review items</span><span><strong>{totalAudioCount}</strong> audio samples</span></div>
        <button className="primary" onClick={() => void exportWorkspaceBackup()}>Export full backup ZIP</button>
        <button onClick={() => restoreBackupRef.current?.click()}>Import / restore backup ZIP</button>
        <p className="small">Restore adds records without overwriting existing IDs. Export backups regularly and before clearing browser data.</p>
      </div>
      <div className="panel">
        <p className="eyebrow">RETURN EXPERT FEEDBACK</p><h2>Prepare review submission</h2>
        <p className="muted">The review package includes all items, expert notes and associated audio. Use the device share sheet where available, or download the ZIP and attach it manually.</p>
        <div className="submission-summary"><div><strong>{items.length}</strong><span>Items included</span></div><div><strong>{reviewedCount}</strong><span>Marked reviewed</span></div></div>
        <button className="primary" disabled={!items.length} onClick={() => void prepareSubmission()}>Prepare and share review ZIP</button>
        <p className="small warning-note">This is a Workbench review package, not yet a direct Academy import. The Academy owner must validate and map approved changes.</p>
      </div>
      <div className="panel import-panel">
        <p className="eyebrow">LOAD CONTENT</p><h2>Import review items</h2>
        <p className="muted">Use the Workbench JSON format to add records. Existing record IDs are skipped, never overwritten.</p>
        <button onClick={() => importItemsRef.current?.click()}>Choose JSON file</button>
        <button onClick={downloadTemplate}>Download JSON template</button>
      </div>
      <div className="panel privacy-panel">
        <p className="eyebrow">IMPORTANT INFORMATION</p><h2>Local storage and sharing</h2>
        <ul><li>Data is stored in this browser on this device; there is no cloud sync.</li><li>Clearing browser data may delete reviews and recordings. Keep a backup.</li><li>Sharing hands the ZIP to another app. It does not confirm delivery.</li><li>The Academy owner reviews submissions and decides what is approved for publication.</li></ul>
      </div>
    </section>}

    <input ref={importItemsRef} className="hidden-input" type="file" accept=".json,application/json" onChange={event => { void handleItemsImport(event.target.files?.[0]); event.target.value = '' }} />
    <input ref={restoreBackupRef} className="hidden-input" type="file" accept=".zip,application/zip" onChange={event => { void handleBackupRestore(event.target.files?.[0]); event.target.value = '' }} />
    <footer>Meitei Mayek Linguistic Review Workbench <span>·</span> Independent expert tool <span>·</span> Local-first</footer>
  </main>
}
