import { useEffect, useState } from 'react'
import { db, type ReviewItem } from './db'
import { exportWorkspaceBackup, exportReviewPackage } from './export'

type Tab = 'home' | 'review'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [selected, setSelected] = useState<string>('')
  const [saved, setSaved] = useState(true)
  const [message, setMessage] = useState('Your work is stored in this browser on this device.')

  async function refresh() {
    const rows = await db.items.orderBy('updatedAt').reverse().toArray()
    setItems(rows)
    if (!selected && rows[0]) setSelected(rows[0].id)
  }

  useEffect(() => { void refresh() }, [])

  const active = items.find(item => item.id === selected)

  async function updateActive(patch: Partial<ReviewItem>) {
    if (!active) return
    setSaved(false)
    const updated = { ...active, ...patch, updatedAt: new Date().toISOString() }
    await db.items.put(updated)
    await refresh()
    setSaved(true)
  }

  async function addBlankItem() {
    const id = crypto.randomUUID()
    const item: ReviewItem = {
      id, category: 'Unassigned', glyph: '', unicodeSequence: '',
      displayLabel: 'New review item', reviewStatus: 'not_reviewed',
      expertNotes: '', updatedAt: new Date().toISOString()
    }
    await db.items.put(item)
    await refresh()
    setSelected(id)
    setTab('review')
    setMessage('A blank local review item was created. Replace it with an Academy-assigned record.')
  }

  return <main className="shell">
    <header className="topbar">
      <div><div className="eyebrow">MEITEI MAYEK ACADEMY</div><h1>Linguistic Review</h1></div>
      <span className="local-tag">Local workspace</span>
    </header>

    <nav className="tabs">
      <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>Home</button>
      <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Review</button>
    </nav>

    {tab === 'home' ? <section className="panel">
      <p className="eyebrow">EXPERT WORKSPACE</p>
      <h2>Review. Record. Share.</h2>
      <p className="muted">A simple place to check assigned characters and pronunciation material. No account is required.</p>
      <div className="stats"><div><strong>{items.length}</strong><span>Local items</span></div><div><strong>{items.filter(x => x.reviewStatus === 'reviewed').length}</strong><span>Reviewed</span></div></div>
      <div className="actions">
        <button className="primary" onClick={() => setTab('review')}>Open review</button>
        <button onClick={() => void addBlankItem()}>Add a blank item</button>
      </div>
      <div className="notice">{message}</div>
      <div className="actions">
        <button onClick={() => void exportWorkspaceBackup()}>Export backup</button>
        <button onClick={() => void exportReviewPackage(items)}>Prepare review ZIP</button>
      </div>
      <p className="small">Important: this device does not sync with another device. Export a backup before switching devices or clearing browser data.</p>
    </section> : <section className="review-layout">
      <aside className="panel item-list">
        <div className="section-head"><h2>Review items</h2><button className="small-button" onClick={() => void addBlankItem()}>＋ Add</button></div>
        {items.length === 0 && <p className="muted">No Academy records loaded yet. The Academy schema adapter must be connected before real content is imported.</p>}
        {items.map(item => <button key={item.id} className={`item-row ${selected === item.id ? 'chosen' : ''}`} onClick={() => setSelected(item.id)}>
          <strong>{item.glyph || '—'} {item.displayLabel}</strong><span>{item.category} · {item.reviewStatus.replaceAll('_', ' ')}</span>
        </button>)}
      </aside>
      <section className="panel editor">
        {!active ? <><h2>No item selected</h2><p className="muted">Import Academy-assigned records after the schema adapter is connected.</p></> : <>
          <p className="eyebrow">REVIEW ITEM</p><h2>{active.glyph || active.displayLabel}</h2>
          <label>Display label<input value={active.displayLabel} onChange={e => void updateActive({ displayLabel: e.target.value })} /></label>
          <label>Expert review status<select value={active.reviewStatus} onChange={e => void updateActive({ reviewStatus: e.target.value as ReviewItem['reviewStatus'] })}>
            <option value="not_reviewed">Not reviewed</option><option value="in_progress">In progress</option><option value="needs_clarification">Needs clarification</option><option value="reviewed">Reviewed</option>
          </select></label>
          <label>Expert notes<textarea rows={5} value={active.expertNotes} onChange={e => void updateActive({ expertNotes: e.target.value })} placeholder="Add a correction, explanation, or question…" /></label>
          <div className="save-line">{saved ? '✓ Saved on this device' : 'Saving…'}</div>
          <p className="small">Character identity and linguistic fields will be connected to the approved Academy schema before expert use.</p>
        </>}
      </section>
    </section>}

    <footer>Meitei Mayek Linguistic Review Workbench · Early starter</footer>
  </main>
}
