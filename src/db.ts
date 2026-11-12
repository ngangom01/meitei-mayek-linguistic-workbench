import Dexie, { type Table } from 'dexie'

export interface ReviewItem {
  id: string
  category: string
  glyph: string
  unicodeSequence: string
  displayLabel: string
  reviewStatus: 'not_reviewed' | 'in_progress' | 'needs_clarification' | 'reviewed'
  expertNotes: string
  updatedAt: string
}

export interface AudioSample {
  id: string
  itemId: string
  blob: Blob
  mimeType: string
  durationMs: number
  createdAt: string
}

class WorkbenchDB extends Dexie {
  items!: Table<ReviewItem, string>
  audio!: Table<AudioSample, string>

  constructor() {
    super('meitei-mayek-review-workbench')
    this.version(1).stores({
      items: 'id, category, reviewStatus, updatedAt',
      audio: 'id, itemId, createdAt'
    })
  }
}

export const db = new WorkbenchDB()
