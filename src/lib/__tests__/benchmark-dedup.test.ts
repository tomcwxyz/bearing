import { describe, expect, it } from 'vitest'
import { deduplicateSnapshotRows, snapshotConflictKey } from '../benchmark-dedup'
import type { SnapshotRow } from '../benchmarks'

const sample = (name: string, overrides: Partial<SnapshotRow> = {}): SnapshotRow => ({
  source: 'lmarena',
  sourceCategory: 'overall',
  sourceModelName: name,
  rawScore: 1300,
  voteCount: 120,
  snapshotDate: '2026-10-09',
  ...overrides,
})

describe('benchmark import conflict-key deduplication', () => {
  it('uses all four database conflict columns, not only the model name', () => {
    const a = sample('Claude Haiku 4.5')
    const otherCategory = sample('Claude Haiku 4.5', { sourceCategory: 'coding' })
    const otherDate = sample('Claude Haiku 4.5', { snapshotDate: '2026-10-08' })
    const otherSource = sample('Claude Haiku 4.5', { source: 'artificialanalysis' })
    expect(new Set([a, otherCategory, otherDate, otherSource].map(snapshotConflictKey)).size).toBe(4)
    expect(deduplicateSnapshotRows([a, otherCategory, otherDate, otherSource]).duplicatesRemoved).toBe(0)
  })

  it('collapses exact copies before JSON batches reach PostgreSQL', () => {
    const a = sample('Mistral Large 4')
    const result = deduplicateSnapshotRows([a, { ...a }, { ...a }])
    expect(result).toEqual({ rows: [a], duplicatesRemoved: 2, conflictingKeys: 0 })
  })

  it('selects the highest-vote measurement for duplicate leaderboard keys', () => {
    const low = sample('Sol', { rawScore: 1400, voteCount: 12 })
    const high = sample('Sol', { rawScore: 1380, voteCount: 2000 })
    for (const input of [[low, high], [high, low]]) {
      const result = deduplicateSnapshotRows(input)
      expect(result.rows).toEqual([high])
      expect(result.duplicatesRemoved).toBe(1)
      expect(result.conflictingKeys).toBe(1)
    }
  })

  it('resolves tied vote counts conservatively and independently of fetch order', () => {
    const a = sample('Qwen 3', { rawScore: 1500 })
    const b = sample('Qwen 3', { rawScore: 1200 })
    expect(deduplicateSnapshotRows([a, b]).rows[0].rawScore).toBe(1200)
    expect(deduplicateSnapshotRows([b, a]).rows[0].rawScore).toBe(1200)
    const slow = sample('Timing', { rawScore: 1.6, lowerIsBetter: true })
    const slower = sample('Timing', { rawScore: 2.1, lowerIsBetter: true })
    expect(deduplicateSnapshotRows([slow, slower]).rows[0].rawScore).toBe(2.1)
  })

  it('handles duplicates across what would have been 300-row batches', () => {
    const originals = Array.from({ length: 350 }, (_, i) => sample(`Model-${i}`))
    const input = [originals[0], ...originals, { ...originals[0] }]
    const result = deduplicateSnapshotRows(input)
    expect(result.rows).toHaveLength(350)
    expect(result.duplicatesRemoved).toBe(2)
    expect(new Set(result.rows.map(snapshotConflictKey)).size).toBe(350)
  })

  it('reports conflicting source keys once even when repeated many times', () => {
    const values = [sample('M', { rawScore: 1 }), sample('M', { rawScore: 2 }), sample('M', { rawScore: 3 })]
    const result = deduplicateSnapshotRows(values)
    expect(result.duplicatesRemoved).toBe(2)
    expect(result.conflictingKeys).toBe(1)
    expect(result.rows[0].rawScore).toBe(1)
  })

  it('leaves unique rows unchanged and allows repeated whole imports', () => {
    const rows = [sample('A'), sample('B', { sourceCategory: 'coding' })]
    const first = deduplicateSnapshotRows(rows)
    const second = deduplicateSnapshotRows([...rows])
    expect(first.rows).toEqual(second.rows)
    expect(first.duplicatesRemoved).toBe(0)
    expect(second.conflictingKeys).toBe(0)
  })
})
