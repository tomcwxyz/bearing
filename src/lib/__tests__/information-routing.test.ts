import { describe, expect, it } from 'vitest'
import { pickInformationRoute } from '../information-routing'
import type { ScoredModel } from '../scoring'

function model(
  slug: string,
  provider: string,
  weightedScore: number,
  estimatedCost: number,
  quality = 0.8,
): ScoredModel {
  return {
    slug,
    name: slug,
    provider,
    tier: 'balanced',
    weightedScore,
    factorScores: {
      quality,
      capability: 0.9,
      cost: estimatedCost <= 0.01 ? 0.9 : 0.3,
      transparency: 0.5,
      privacy: 0.5,
      sustainability: 0.5,
      speed: 0.7,
    },
    estimatedCost,
    capabilities: [],
    strengths: [],
    weaknesses: [],
    contextWindow: 128_000,
  }
}

const allRunnable = () => true

describe('pickInformationRoute', () => {
  it('keeps the selected anchor first', () => {
    const models = [
      model('a', 'Provider A', 0.90, 0.03),
      model('b', 'Provider B', 0.88, 0.02),
      model('c', 'Provider C', 0.86, 0.01),
    ]

    const route = pickInformationRoute(models, {
      k: 3,
      anchorSlug: 'b',
      runnable: allRunnable,
    })

    expect(route[0].model.slug).toBe('b')
    expect(route[0].recommendationRank).toBe(2)
    expect(route[0].selectionReason).toBe('Selected model')
  })

  it('prefers an informative provider/cost contrast over mechanically taking the next rank', () => {
    const models = [
      model('anchor', 'Provider A', 0.90, 0.04),
      model('same-provider', 'Provider A', 0.895, 0.039),
      model('different-provider', 'Provider B', 0.885, 0.012),
      model('lower', 'Provider C', 0.75, 0.01),
    ]

    const route = pickInformationRoute(models, { k: 2, runnable: allRunnable })

    expect(route.map((entry) => entry.model.slug)).toEqual(['anchor', 'different-provider'])
    expect(route[1].selectionReason).toContain('different provider')
    expect(route[1].selectionReason).toContain('cheaper')
  })

  it('can deliberately test local versus hosted when scores remain credible', () => {
    const models = [
      model('hosted', 'Provider A', 0.90, 0.03),
      model('hosted-near', 'Provider B', 0.885, 0.025),
      model('local', 'Provider C', 0.88, 0.02),
    ]

    const route = pickInformationRoute(models, {
      k: 2,
      runnable: allRunnable,
      isLocal: (slug) => slug === 'local',
    })

    expect(route[1].model.slug).toBe('local')
    expect(route[1].selectionReason).toContain('local option')
  })

  it('uses evidence scarcity to prefer an under-tested but similarly credible candidate', () => {
    const models = [
      model('anchor', 'Provider A', 0.90, 0.03),
      model('well-tested', 'Provider B', 0.885, 0.02),
      model('under-tested', 'Provider B', 0.88, 0.02),
    ]

    const route = pickInformationRoute(models, {
      k: 2,
      runnable: allRunnable,
      outcomeScarcity: (slug) => slug === 'under-tested' ? 1 : 0,
    })

    expect(route[1].model.slug).toBe('under-tested')
    expect(route[1].selectionReason).toContain('little real-world evidence')
  })

  it('skips unrunnable candidates', () => {
    const models = [
      model('anchor', 'Provider A', 0.90, 0.03),
      model('unavailable', 'Provider B', 0.89, 0.01),
      model('runnable', 'Provider C', 0.87, 0.015),
    ]

    const route = pickInformationRoute(models, {
      k: 2,
      runnable: (slug) => slug !== 'unavailable',
    })

    expect(route.map((entry) => entry.model.slug)).toEqual(['anchor', 'runnable'])
  })

  it('returns no route when the requested anchor cannot run', () => {
    const models = [model('a', 'Provider A', 0.90, 0.03)]
    const route = pickInformationRoute(models, {
      k: 2,
      anchorSlug: 'a',
      runnable: () => false,
    })

    expect(route).toEqual([])
  })
})