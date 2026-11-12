import Dexie, { type Table } from 'dexie'

export type ReviewStatus = 'not_reviewed' | 'in_progress' | 'needs_clarification' | 'reviewed'

export interface ReviewItem {
  id: string
  category: string
  glyph: string
  unicodeSequence: string
  displayLabel: string
  letterName: string
  pronunciation: string
  writingNotes: string
  syllableExamples: string
  variantNotes: string
  sourceReference: string
  reviewStatus: ReviewStatus
  expertNotes: string
  createdAt: string
  updatedAt: string
}

export interface AudioSample {
  id: string
  itemId: string
  blob: Blob
  mimeType: string
  durationMs: number
  createdAt: string
  label: string
}

const statuses: ReviewStatus[] = ['not_reviewed', 'in_progress', 'needs_clarification', 'reviewed']

export function normalizeReviewItem(value: unknown): ReviewItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id.trim()) return null
  const now = new Date().toISOString()
  const status = typeof row.reviewStatus === 'string' && statuses.includes(row.reviewStatus as ReviewStatus)
    ? row.reviewStatus as ReviewStatus
    : 'not_reviewed'
  const text = (key: string) => typeof row[key] === 'string' ? row[key] as string : ''
  return {
    id: row.id.trim(),
    category: text('category'),
    glyph: text('glyph'),
    unicodeSequence: text('unicodeSequence'),
    displayLabel: text('displayLabel') || 'Untitled review item',
    letterName: text('letterName'),
    pronunciation: text('pronunciation'),
    writingNotes: text('writingNotes'),
    syllableExamples: text('syllableExamples'),
    variantNotes: text('variantNotes'),
    sourceReference: text('sourceReference'),
    reviewStatus: status,
    expertNotes: text('expertNotes'),
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : now,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : now
  }
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
    this.version(2).stores({
      items: 'id, category, reviewStatus, updatedAt',
      audio: 'id, itemId, createdAt'
    }).upgrade(async tx => {
      await tx.table('items').toCollection().modify(item => {
        const row = item as ReviewItem
        const now = new Date().toISOString()
        if (!row.createdAt) row.createdAt = row.updatedAt || now
        for (const key of ['letterName', 'pronunciation', 'writingNotes', 'syllableExamples', 'variantNotes', 'sourceReference'] as const) {
          if (typeof row[key] !== 'string') row[key] = ''
        }
      })
      await tx.table('audio').toCollection().modify(sample => {
        const row = sample as AudioSample
        if (typeof row.label !== 'string') row.label = 'Pronunciation sample'
      })
    })
  }
}

export const db = new WorkbenchDB()
