import { describe, expect, it } from 'vitest'
import { recommendationEvidence } from '../recommendation-evidence'

const now = new Date('2026-09-13T12:00:00Z')

describe('recommendationEvidence', () => {
  it('reports high confidence for recently verified current metadata', () => {
    const result = recommendationEvidence({
      verification_status: 'current',
      verification_source: 'openrouter',
      last_verified_at: '2026-09-12T12:00:00Z',
    }, now)

    expect(result.level).toBe('high')
    expect(result.label).toBe('Evidence confidence: high')
    expect(result.detail).toContain('OpenRouter')
  })

  it('reports medium confidence when a current verification is stale', () => {
    const result = recommendationEvidence({
      verification_status: 'current',
      verification_source: 'openrouter',
      last_verified_at: '2026-09-01T12:00:00Z',
    }, now)

    expect(result.level).toBe('medium')
    expect(result.detail).toContain('12 days ago')
  })

  it('surfaces drift as low confidence without changing the recommendation', () => {
    const result = recommendationEvidence({
      verification_status: 'attention',
      verification_source: 'openrouter',
      verification_note: 'context 128,000 → 163,840 tokens',
      last_verified_at: '2026-09-13T11:00:00Z',
    }, now)

    expect(result.level).toBe('low')
    expect(result.detail).toContain('context 128,000 → 163,840 tokens')
  })

  it('explains unavailable evidence rather than treating it as deactivation', () => {
    const result = recommendationEvidence({
      verification_status: 'unavailable',
      verification_source: 'openrouter',
      last_verified_at: '2026-09-13T11:00:00Z',
    }, now)

    expect(result.level).toBe('low')
    expect(result.detail).toContain('has not removed it automatically')
  })

  it('keeps never-verified models explicitly unknown', () => {
    const result = recommendationEvidence({ verification_status: 'unknown' }, now)

    expect(result.level).toBe('unknown')
    expect(result.label).toBe('Evidence not verified')
  })
})
