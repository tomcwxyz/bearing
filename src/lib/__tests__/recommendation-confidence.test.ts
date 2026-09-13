import { describe, expect, it } from 'vitest'
import { benchmarkEvidence } from '../benchmark-evidence'
import { summariseOutcomeEvidence } from '../outcome-evidence'
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

const benchmarkNow = new Date('2026-09-13T12:00:00Z')

describe('recommendationConfidence', () => {
  it('reports high confidence when classification, separation and evidence are all strong', () => {
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

  it('lowers confidence when a supported human outcome sample contradicts the recommendation', () => {
    const outcomes = summariseOutcomeEvidence({
      humanPositive: 1,
      humanNegative: 4,
      humanTies: 0,
      judgePositive: 8,
      judgeNegative: 0,
    }, 'task_type+complexity')

    const result = recommendationConfidence({
      classificationConfidence: 0.92,
      topScore: 0.84,
      secondScore: 0.7,
      evidence: highEvidence,
      outcomes,
    })

    expect(result.level).toBe('low')
    expect(result.shouldChallenge).toBe(true)
    expect(result.detail).toContain('human outcome evidence')
  })

  it('can cite supportive human outcomes without allowing machine judge support to masquerade as human evidence', () => {
    const outcomes = summariseOutcomeEvidence({
      humanPositive: 4,
      humanNegative: 1,
      humanTies: 0,
      judgePositive: 0,
      judgeNegative: 10,
    }, 'task_type+complexity')

    const result = recommendationConfidence({
      classificationConfidence: 0.92,
      topScore: 0.84,
      secondScore: 0.7,
      evidence: highEvidence,
      outcomes,
    })

    expect(result.level).toBe('high')
    expect(result.detail).toContain('5 human outcome signals')
  })

  it('lowers confidence when fresh multi-source benchmark evidence strongly contradicts the curated score', () => {
    const benchmark = benchmarkEvidence({
      curatedScore: 0.9,
      aggregate: {
        score: 0.58,
        sourceCount: 3,
        categoryCount: 4,
        latestSnapshot: '2026-09-05',
        totalVotes: 4000,
      },
      now: benchmarkNow,
    })

    const result = recommendationConfidence({
      classificationConfidence: 0.92,
      topScore: 0.84,
      secondScore: 0.7,
      evidence: highEvidence,
      benchmark,
    })

    expect(result.level).toBe('low')
    expect(result.shouldChallenge).toBe(true)
    expect(result.detail).toContain('benchmark evidence strongly disagrees')
  })

  it('does not let stale single-source disagreement create false certainty', () => {
    const benchmark = benchmarkEvidence({
      curatedScore: 0.9,
      aggregate: {
        score: 0.58,
        sourceCount: 1,
        categoryCount: 1,
        latestSnapshot: '2025-01-01',
        totalVotes: null,
      },
      now: benchmarkNow,
    })

    const result = recommendationConfidence({
      classificationConfidence: 0.92,
      topScore: 0.84,
      secondScore: 0.7,
      evidence: highEvidence,
      benchmark,
    })

    expect(result.level).toBe('medium')
    expect(result.shouldChallenge).toBe(true)
    expect(result.detail).toContain('weak or stale')
  })
})