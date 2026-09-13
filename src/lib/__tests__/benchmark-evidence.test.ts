import { describe, expect, it } from 'vitest'
import { benchmarkEvidence } from '../benchmark-evidence'

const now = new Date('2026-09-13T12:00:00Z')

describe('benchmarkEvidence', () => {
  it('reports no evidence when there is no comparable benchmark aggregate', () => {
    const evidence = benchmarkEvidence({ curatedScore: 0.8, aggregate: null, now })

    expect(evidence.agreement).toBe('none')
    expect(evidence.strength).toBe('none')
    expect(evidence.delta).toBeNull()
  })

  it('treats a small delta as aligned', () => {
    const evidence = benchmarkEvidence({
      curatedScore: 0.80,
      aggregate: {
        score: 0.86,
        sourceCount: 2,
        categoryCount: 3,
        latestSnapshot: '2026-09-01',
        totalVotes: 1200,
      },
      now,
    })

    expect(evidence.agreement).toBe('aligned')
    expect(evidence.strength).toBe('high')
    expect(evidence.uncertainty).toBeLessThan(0.2)
  })

  it('turns a large well-supported delta into strong uncertainty rather than discarding it', () => {
    const evidence = benchmarkEvidence({
      curatedScore: 0.88,
      aggregate: {
        score: 0.55,
        sourceCount: 3,
        categoryCount: 4,
        latestSnapshot: '2026-09-05',
        totalVotes: 5000,
      },
      now,
    })

    expect(evidence.agreement).toBe('strong_disagreement')
    expect(evidence.strength).toBe('high')
    expect(evidence.uncertainty).toBe(1)
    expect(evidence.detail).toContain('33 points lower')
  })

  it('keeps stale single-source disagreement weaker than fresh multi-source disagreement', () => {
    const evidence = benchmarkEvidence({
      curatedScore: 0.8,
      aggregate: {
        score: 0.55,
        sourceCount: 1,
        categoryCount: 1,
        latestSnapshot: '2025-01-01',
        totalVotes: null,
      },
      now,
    })

    expect(evidence.agreement).toBe('strong_disagreement')
    expect(evidence.strength).toBe('low')
    expect(evidence.uncertainty).toBeLessThan(1)
    expect(evidence.uncertainty).toBeGreaterThan(0.5)
  })
})
