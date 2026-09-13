import { describe, expect, it } from 'vitest'
import { selectTradeoffAlternatives } from '../tradeoff-alternatives'
import type { ScoredModel } from '../scoring'

function model(
  slug: string,
  weightedScore: number,
  estimatedCost: number,
  factors: Partial<ScoredModel['factorScores']> = {},
): ScoredModel {
  return {
    slug,
    name: slug,
    provider: 'Provider',
    tier: 'balanced',
    weightedScore,
    factorScores: {
      quality: 0.8,
      capability: 0.8,
      cost: 0.5,
      speed: 0.6,
      privacy: 0.5,
      sustainability: 0.5,
      transparency: 0.5,
      ...factors,
    },
    estimatedCost,
    capabilities: [],
    strengths: [],
    weaknesses: [],
    contextWindow: 128_000,
  }
}

describe('selectTradeoffAlternatives', () => {
  it('prefers material trade-offs over mechanically taking ranks two and three', () => {
    const models = [
      model('best', 0.90, 0.04),
      model('similar-rank-two', 0.89, 0.039),
      model('cheap', 0.87, 0.012),
      model('fast', 0.86, 0.035, { speed: 0.86 }),
    ]

    const alternatives = selectTradeoffAlternatives(models)

    expect(alternatives.map((alternative) => alternative.slug)).toEqual(['cheap', 'fast'])
    expect(alternatives[0].key).toBe('cost')
    expect(alternatives[1].key).toBe('speed')
    expect(alternatives[0].originalRank).toBe(3)
  })

  it('does not feature two versions of the same trade-off when a distinct choice exists', () => {
    const models = [
      model('best', 0.90, 0.05),
      model('cheap-one', 0.88, 0.015),
      model('cheap-two', 0.87, 0.012),
      model('private', 0.86, 0.045, { privacy: 0.82 }),
    ]

    const alternatives = selectTradeoffAlternatives(models)

    expect(alternatives).toHaveLength(2)
    expect(new Set(alternatives.map((alternative) => alternative.key)).size).toBe(2)
    expect(alternatives.some((alternative) => alternative.key === 'privacy')).toBe(true)
  })

  it('can deliberately feature a local alternative to a hosted best fit', () => {
    const models = [
      model('hosted-best', 0.90, 0.03),
      model('hosted-close', 0.89, 0.029),
      model('local', 0.85, 0.028),
    ]

    const alternatives = selectTradeoffAlternatives(models, {
      limit: 1,
      isLocal: (slug) => slug === 'local',
    })

    expect(alternatives[0].slug).toBe('local')
    expect(alternatives[0].key).toBe('local')
    expect(alternatives[0].label).toBe('Local option')
  })

  it('does not promote a weak model solely because it has an extreme factor advantage', () => {
    const models = [
      model('best', 0.90, 0.05),
      model('credible', 0.86, 0.048),
      model('very-cheap-but-weak', 0.60, 0.001),
    ]

    const alternatives = selectTradeoffAlternatives(models, { limit: 1 })

    expect(alternatives[0].slug).toBe('credible')
    expect(alternatives[0].key).toBe('close')
  })

  it('falls back honestly to a close alternative when the ranking is homogeneous', () => {
    const models = [
      model('best', 0.90, 0.03),
      model('second', 0.88, 0.029),
      model('third', 0.86, 0.028),
    ]

    const alternatives = selectTradeoffAlternatives(models, { limit: 2 })

    expect(alternatives.map((alternative) => alternative.slug)).toEqual(['second', 'third'])
    expect(alternatives.every((alternative) => alternative.key === 'close')).toBe(true)
  })
})
