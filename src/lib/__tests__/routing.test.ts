import { describe, it, expect } from 'vitest'
import { pickRoute } from '../routing'
import type { ScoredModel } from '../scoring'

function model(slug: string): ScoredModel {
  return {
    slug,
    name: slug,
    provider: 'test',
    tier: 'flagship',
    weightedScore: 0.5,
    factorScores: {
      cost: 0, speed: 0, quality: 0, privacy: 0,
      sustainability: 0, transparency: 0, capability: 0,
    },
    estimatedCost: 0,
    capabilities: [],
    strengths: [],
    weaknesses: [],
    contextWindow: 8000,
  }
}

const all = (..._slugs: string[]) => true

describe('pickRoute', () => {
  it('returns the single top model for k=1', () => {
    const route = pickRoute([model('a'), model('b'), model('c')], { k: 1, runnable: all })
    expect(route.map((m) => m.slug)).toEqual(['a'])
  })

  it('returns the top three for k=3', () => {
    const route = pickRoute([model('a'), model('b'), model('c'), model('d')], { k: 3, runnable: all })
    expect(route.map((m) => m.slug)).toEqual(['a', 'b', 'c'])
  })

  it('skips non-runnable models without reordering the survivors', () => {
    const runnable = (slug: string) => slug !== 'a' && slug !== 'c'
    const route = pickRoute([model('a'), model('b'), model('c'), model('d')], { k: 2, runnable })
    expect(route.map((m) => m.slug)).toEqual(['b', 'd'])
  })

  it('returns fewer than k when not enough models are runnable', () => {
    const runnable = (slug: string) => slug === 'b'
    const route = pickRoute([model('a'), model('b'), model('c')], { k: 3, runnable })
    expect(route.map((m) => m.slug)).toEqual(['b'])
  })

  it('returns empty when nothing is runnable', () => {
    const route = pickRoute([model('a'), model('b')], { k: 2, runnable: () => false })
    expect(route).toEqual([])
  })

  it('returns empty for empty input', () => {
    expect(pickRoute([], { k: 1, runnable: all })).toEqual([])
  })

  it('returns empty for k<=0', () => {
    expect(pickRoute([model('a')], { k: 0, runnable: all })).toEqual([])
  })
})
