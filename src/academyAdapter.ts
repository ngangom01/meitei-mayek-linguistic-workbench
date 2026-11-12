import type { ReviewItem } from './db'

/**
 * Academy integration boundary.
 *
 * Replace these functions only after inspecting the CURRENT Academy schema.
 * Never guess field names or transform linguistic values without an agreed mapping.
 */
export function fromAcademyRecords(_records: unknown[]): ReviewItem[] {
  throw new Error('Academy schema adapter is not configured. Inspect the Academy repository first.')
}

export function toAcademySubmission(_items: ReviewItem[]): unknown {
  throw new Error('Academy schema adapter is not configured. Inspect the Academy repository first.')
}
