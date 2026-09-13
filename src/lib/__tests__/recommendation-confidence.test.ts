import { describe, expect, it } from 'vitest'
import { recommendationConfidence } from '../recommendation-confidence'

const highEvidence = {
  level: 'high' as const,
  label: 'Evidence confidence: high',
  detail: 'Current',
  source: 'openrouter',
  verifiedAt: '2026-09-13T10:00:00.000Z',
}

const lowEvidence = {
  level: 'low' as const,
  label: 'Evidence confidence: low',
  detail: 'Needs review',
  source: 'openrouter',
  verifiedAt: '2026-09-13T10:00:00.000Z',
}

describe('recommendationConfidence', () => {
  it('reports high confidence only when classification, separation and evidence are all strong', () => {
    const result = recommendationConfidence({
      classificationConfidence: 0.92,
      topScore: 0.82,
      secondScore: 0.72,
      evidence: highEvidence,
    })

    expect(result.level).toBe('high')
    expect(result.shouldChallenge).toBe(false)
  })

  it('reports low confidence for a very close decision even with current catalogue evidence', () => {
    const result = recommendationConfidence({
      classificationConfidence: 0.9,
      topScore: 0.8,
      secondScore: 0.79,
      evidence: highEvidence,
    })

    expect(result.level).toBe('low')
    expect(result.shouldChallenge).toBe(true)
    expect(result.detail).toContain('very close')
  })

  it('reports low confidence when the top recommendation has weak catalogue evidence', () => {
    const result = recommendationConfidence({
      classificationConfidence: 0.9,
      topScore: 0.84,
      secondScore: 0.7,
      evidence: lowEvidence,
    })

    expect(result.level).toBe('low')
    expect(result.detail).toContain('catalogue evidence')
  })

  it('keeps incomplete evidence at medium rather than inventing certainty', () => {
    const result = recommendationConfidence({
      classificationConfidence: 0.75,
      topScore: 0.82,
      secondScore: 0.76,
      evidence: null,
    })

    expect(result.level).toBe('medium')
    expect(result.detail).toContain('not yet been verified')
  })
})
