import { useEffect, useMemo, useRef, useState } from 'react'
import { db, type AudioSample, type ReviewItem, type ReviewStatus } from './db'
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
  const [message, setMessage] = useState('Your reviews and recordings stay in this browser on this device.')
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const importItemsRef = useRef<HTMLInputElement>(null)
  const restoreBackupRef = useRef<HTMLInputElement>(null)

  async function refreshItems() {
    const rows = await db.items.orderBy('updatedAt').reverse().toArray()
    setItems(rows)
    setSelected(current => current || rows[0]?.id || '')
    setTotalAudioCount(await db.audio.count())
  }

  useEffect(() => { void refreshItems() }, [])

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
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return items.filter(item => {
      const searchable = [item.id, item.glyph, item.displayLabel, item.category, item.letterName, item.pronunciation]
      const matchesText = !query || searchable.some(value => value.toLocaleLowerCase().includes(query))
      return matchesText && (statusFilter === 'all' || item.reviewStatus === statusFilter)
    })
  }, [items, search, statusFilter])

  async function updateItem(id: string, patch: Partial<ReviewItem>) {
    const current = await db.items.get(id)
    if (!current) return
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() }
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
      variantNotes: '', sourceReference: '', reviewStatus: 'not_reviewed',
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
    setAudioSamples(rows => rows.filter(row => row.id !== sample.id))
    setTotalAudioCount(await db.audio.count())
    setMessage('Recording deleted from this device.')
  }

  async function startRecording() {
    if (!active || recording) return
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage('Audio recording is not supported by this browser. Use a current Chrome, Edge or Safari browser over HTTPS.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
        setRecording(false)
        if (blob.size > 0) {
          const count = await db.audio.where('itemId').equals(itemId).count()
          const sample: AudioSample = {
            id: crypto.randomUUID(), itemId, blob, mimeType: blob.type,
            durationMs, createdAt: new Date().toISOString(),
            label: 'Pronunciation ' + (count + 1)
          }
          await db.audio.add(sample)
          if (selected === itemId) setAudioSamples(await db.audio.where('itemId').equals(itemId).sortBy('createdAt'))
          setTotalAudioCount(await db.audio.count())
          setMessage('Recording saved locally. Play it back to check the sound.')
        } else {
          setMessage('No audio data was captured. Please try recording again.')
        }
      }
      streamRef.current = stream
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      recorder.start()
      setRecording(true)
      setMessage('Recording… speak clearly, then press Stop recording.')
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      setMessage(name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow microphone access in your browser settings and try again.'
        : 'Could not start the microphone. Check that it is connected and not being used by another app.')
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
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
      <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>Overview</button>
      <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Review workspace <span className="count">{items.length}</span></button>
      <button className={tab === 'share' ? 'active' : ''} onClick={() => setTab('share')}>Backup & share</button>
    </nav>

    <div className="status-message" role="status">{message}</div>

    {tab === 'home' && <section className="home-grid">
      <div className="panel hero">
        <p className="eyebrow">EXPERT WORKSPACE</p>
        <h2>One place to review<br />Meitei Mayek material.</h2>
        <p className="muted">Check character details, add pronunciation guidance and comments, record audio, then return a review package to the Academy owner.</p>
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
        <div className="step"><span>02</span><div><strong>Review the content</strong><p>Check character identity and enter names, pronunciation, writing notes, combinations and questions.</p></div></div>
        <div className="step"><span>03</span><div><strong>Record and listen</strong><p>Attach one or more original audio samples to each item. Retake or remove a sample as needed.</p></div></div>
        <div className="step"><span>04</span><div><strong>Return your review</strong><p>Export a review ZIP and send it to the Academy owner. The owner validates and applies approved changes.</p></div></div>
      </div>
    </section>}

    {tab === 'review' && <section className="review-layout">
      <aside className="panel item-list">
        <div className="section-head"><div><p className="eyebrow">ASSIGNED MATERIAL</p><h2>Review items <span className="count">{items.length}</span></h2></div><button className="small-button" onClick={() => void addBlankItem()}>＋ Add</button></div>
        <input className="search-input" aria-label="Search review items" placeholder="Search glyph, label or ID…" value={search} onChange={event => setSearch(event.target.value)} />
        <select className="filter-select" aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="all">All review statuses</option>
          <option value="not_reviewed">Not reviewed</option><option value="in_progress">In progress</option>
          <option value="needs_clarification">Needs clarification</option><option value="reviewed">Reviewed</option>
        </select>
        {filteredItems.length === 0 && <div className="empty-list"><strong>{items.length ? 'No matching items' : 'No items yet'}</strong><p>{items.length ? 'Try another search or status filter.' : 'Import assigned items or create the first record.'}</p></div>}
        <div className="item-scroll">
          {filteredItems.map(item => <button key={item.id} className={'item-row ' + (selected === item.id ? 'chosen' : '')} onClick={() => setSelected(item.id)}>
            <span className="item-glyph">{item.glyph || '—'}</span><span className="item-text"><strong>{item.displayLabel || 'Untitled item'}</strong><span>{item.category || 'Uncategorised'} · {item.id.slice(0, 12)}</span><em className={'status status-' + item.reviewStatus}>{statusLabels[item.reviewStatus]}</em></span>
          </button>)}
        </div>
        <div className="list-footer"><button className="text-button" onClick={() => importItemsRef.current?.click()}>Import JSON</button><button className="text-button" onClick={downloadTemplate}>Template</button></div>
      </aside>

      <section className="panel editor">
        {!active ? <div className="editor-empty"><div className="empty-symbol">ꯃ</div><h2>Select a review item</h2><p>Choose a record from the list or import assigned items.</p><button className="primary" onClick={() => void addBlankItem()}>Create review item</button></div> : <>
          <div className="editor-heading"><div><p className="eyebrow">RECORD REVIEW</p><h2>{active.glyph || active.displayLabel}</h2><p className="record-id">Record ID: <code>{active.id}</code></p></div><button className="quiet danger" onClick={() => void deleteItem(active)}>Delete item</button></div>

          <div className="identity-strip">
            <div><span>Glyph / character</span><strong className="large-glyph">{active.glyph || '—'}</strong></div>
            <div><span>Unicode sequence</span><strong className="unicode">{active.unicodeSequence || 'Not supplied'}</strong></div>
          </div>

          <div className="form-grid">
            <label>Display label<input value={active.displayLabel} onChange={e => void updateItem(active.id, { displayLabel: e.target.value })} placeholder="e.g. source-provided label" /></label>
            <label>Category<input value={active.category} onChange={e => void updateItem(active.id, { category: e.target.value })} placeholder="e.g. category from source" /></label>
            <label>Glyph / character<input value={active.glyph} onChange={e => void updateItem(active.id, { glyph: e.target.value })} placeholder="Paste the supplied character" /></label>
            <label>Unicode sequence<input value={active.unicodeSequence} onChange={e => void updateItem(active.id, { unicodeSequence: e.target.value })} placeholder="Exact code point(s), if known" /></label>
            <label>Letter / character name<input value={active.letterName} onChange={e => void updateItem(active.id, { letterName: e.target.value })} placeholder="Expert-verified name" /></label>
            <label>Pronunciation guidance<input value={active.pronunciation} onChange={e => void updateItem(active.id, { pronunciation: e.target.value })} placeholder="Phonetic notes / variants" /></label>
            <label className="full">Writing / stroke-order notes<textarea rows={3} value={active.writingNotes} onChange={e => void updateItem(active.id, { writingNotes: e.target.value })} placeholder="Describe the observed writing method or point to a source." /></label>
            <label className="full">Syllables / combinations / examples<textarea rows={3} value={active.syllableExamples} onChange={e => void updateItem(active.id, { syllableExamples: e.target.value })} placeholder="Record source examples and expert corrections." /></label>
            <label className="full">Variants or unresolved questions<textarea rows={2} value={active.variantNotes} onChange={e => void updateItem(active.id, { variantNotes: e.target.value })} placeholder="Record variant forms, uncertainty or questions." /></label>
            <label>Source reference<input value={active.sourceReference} onChange={e => void updateItem(active.id, { sourceReference: e.target.value })} placeholder="Book, chapter, page, video timestamp…" /></label>
            <label>Review status<select value={active.reviewStatus} onChange={e => void updateItem(active.id, { reviewStatus: e.target.value as ReviewStatus })}>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label className="full">Private expert comments<textarea rows={3} value={active.expertNotes} onChange={e => void updateItem(active.id, { expertNotes: e.target.value })} placeholder="Corrections, reasoning, caveats or questions for the Academy owner." /></label>
          </div>

          <div className="recording-panel">
            <div className="section-head"><div><p className="eyebrow">AUDIO REVIEW</p><h3>Pronunciation recordings</h3></div><span className="count">{audioSamples.length} sample(s)</span></div>
            <p className="muted compact">Record one or more samples. The original audio is kept locally and included in the review ZIP.</p>
            <div className="record-controls">
              {!recording ? <button className="record-button" onClick={() => void startRecording()}><span className="record-dot" /> Start recording</button> : <button className="stop-button" onClick={stopRecording}><span className="stop-square" /> Stop recording</button>}
              {recording && <span className="recording-indicator">Recording…</span>}
            </div>
            {audioSamples.length > 0 ? <div className="audio-list">{audioSamples.map(sample => <AudioRow key={sample.id} sample={sample} onDelete={() => void deleteAudio(sample)} />)}</div> : <p className="audio-empty">No recordings attached to this item yet.</p>}
          </div>

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
