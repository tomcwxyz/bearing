import { describe, expect, it } from 'vitest'

import type { ScoredModel } from '@/lib/scoring'
import { assessValidation } from './service'

function model(cost: number): ScoredModel {
  return {
    slug: 'test-model',
    name: 'Test model',
    provider: 'Test',
    tier: 'balanced',
    weightedScore: 0.8,
    factorScores: {
      quality: 0.8,
      capability: 0.8,
      cost,
      transparency: 0.8,
      privacy: 0.8,
      sustainability: 0.8,
      speed: 0.8,
    },
    estimatedCost: 0.01,
    capabilities: [],
    strengths: [],
    weaknesses: [],
    contextWindow: 128000,
  }
}

describe('assessValidation', () => {
  it('treats the top-ranked model as a good fit', () => {
    expect(assessValidation({ currentModel: model(0.2), currentModelRank: 1 })).toBe('good_fit')
  })

  it('flags an expensive top-three model as overpaying', () => {
    expect(assessValidation({ currentModel: model(0.49), currentModelRank: 2 })).toBe('overpaying')
  })

  it('keeps a cost-efficient top-three model as a good fit', () => {
    expect(assessValidation({ currentModel: model(0.5), currentModelRank: 3 })).toBe('good_fit')
  })

  it('finds better options for lower-ranked or missing models', () => {
    expect(assessValidation({ currentModel: model(0.9), currentModelRank: 4 })).toBe('better_options')
    expect(assessValidation({ currentModel: null, currentModelRank: null })).toBe('better_options')
  })
})
