import { describe, it, expect } from 'vitest'
import {
  scoreLocalModels,
  findHardwareTier,
  pickBestQuant,
} from '../local-inference'
import type { Model, LocalInfo, QuantOption } from '../registry'
import type { ScoredModel } from '../scoring'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScoredModel(slug: string, overrides?: Partial<ScoredModel>): ScoredModel {
  return {
    slug,
    name: slug,
    provider: 'Test',
    tier: 'balanced',
    weightedScore: 0.7,
    factorScores: {
      cost: 0.5, speed: 0.5, quality: 0.5, privacy: 0.5,
      sustainability: 0.5, transparency: 0.5, capability: 0.5,
    },
    estimatedCost: 0.01,
    capabilities: ['code'],
    strengths: ['Good'],
    weaknesses: [],
    contextWindow: 128000,
    ...overrides,
  }
}

function makeModel(slug: string, taskFitness: Record<string, number>, localInfo?: LocalInfo): Model {
  return {
    slug,
    name: slug,
    provider: 'Test',
    tier: 'balanced',
    model_class: 'chat',
    pricing: { input_per_1m: 1, output_per_1m: 5 },
    context_window: 128000,
    capabilities: ['code'],
    strengths: ['Good'],
    weaknesses: [],
    task_fitness: taskFitness,
    speed_score: 0.5,
    privacy_score: 0.5,
    transparency: {
      open_weights: 1, open_training_data: 0.3, open_methodology: 0.5,
      licence_openness: 1, provider_disclosure: 0.2,
      fmti_company_score: null, transparency_score: 0.6, notes: '',
    },
    sustainability: {
      inference_energy: 0.5, training_footprint: null,
      provider_infrastructure: 0.4, sustainability_score: 0.45, notes: '',
    },
    local_info: localInfo,
  }
}

const smallQuants: QuantOption[] = [
  { quant: 'Q4_K_M', vram_gb: 5, quality_penalty: 0.05 },
  { quant: 'Q6_K', vram_gb: 7, quality_penalty: 0.02 },
  { quant: 'Q8_0', vram_gb: 9, quality_penalty: 0.0 },
]

const largeQuants: QuantOption[] = [
  { quant: 'Q4_K_M', vram_gb: 40, quality_penalty: 0.05 },
  { quant: 'Q8_0', vram_gb: 75, quality_penalty: 0.0 },
]

const hugeQuants: QuantOption[] = [
  { quant: 'Q4_K_M', vram_gb: 400, quality_penalty: 0.08 },
  { quant: 'Q8_0', vram_gb: 700, quality_penalty: 0.0 },
]

// ---------------------------------------------------------------------------
// findHardwareTier
// ---------------------------------------------------------------------------

describe('findHardwareTier', () => {
  it('assigns small model to consumer laptop', () => {
    const tier = findHardwareTier(5)
    expect(tier?.id).toBe('consumer_laptop')
  })

  it('assigns 14 GB model to prosumer tier', () => {
    const tier = findHardwareTier(14)
    expect(tier?.id).toBe('prosumer')
  })

  it('assigns 40 GB model to workstation tier', () => {
    const tier = findHardwareTier(40)
    expect(tier?.id).toBe('workstation')
  })

  it('assigns 90 GB model to server tier', () => {
    const tier = findHardwareTier(90)
    expect(tier?.id).toBe('server')
  })

  it('returns null for models exceeding all tiers', () => {
    const tier = findHardwareTier(400)
    expect(tier).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// pickBestQuant
// ---------------------------------------------------------------------------

describe('pickBestQuant', () => {
  it('picks the smallest viable quantization', () => {
    const quant = pickBestQuant(smallQuants)
    expect(quant?.quant).toBe('Q4_K_M')
    expect(quant?.vram_gb).toBe(5)
  })

  it('returns null if all options exceed quality penalty threshold', () => {
    const badQuants: QuantOption[] = [
      { quant: 'Q2_K', vram_gb: 3, quality_penalty: 0.3 },
      { quant: 'Q3_K', vram_gb: 4, quality_penalty: 0.25 },
    ]
    expect(pickBestQuant(badQuants)).toBeNull()
  })

  it('skips high-penalty options and picks next viable', () => {
    const mixed: QuantOption[] = [
      { quant: 'Q2_K', vram_gb: 3, quality_penalty: 0.25 },
      { quant: 'Q4_K_M', vram_gb: 5, quality_penalty: 0.05 },
      { quant: 'Q8_0', vram_gb: 9, quality_penalty: 0.0 },
    ]
    const quant = pickBestQuant(mixed)
    expect(quant?.quant).toBe('Q4_K_M')
  })
})

// ---------------------------------------------------------------------------
// scoreLocalModels
// ---------------------------------------------------------------------------

describe('scoreLocalModels', () => {
  it('returns empty when no models have local_info', () => {
    const scored = [makeScoredModel('closed-model')]
    const models = [makeModel('closed-model', { code: 0.8 })] // no local_info
    const result = scoreLocalModels(scored, models, 'code')
    expect(result.recommendations).toHaveLength(0)
    expect(result.tiersUsed).toHaveLength(0)
  })

  it('excludes models with task_fitness below 0.5', () => {
    const scored = [makeScoredModel('weak-model')]
    const models = [makeModel('weak-model', { code: 0.3 }, {
      total_params_b: 8, active_params_b: null, is_moe: false,
      quant_options: smallQuants,
    })]
    const result = scoreLocalModels(scored, models, 'code')
    expect(result.recommendations).toHaveLength(0)
  })

  it('excludes models that exceed the top hardware tier', () => {
    const scored = [makeScoredModel('huge-model')]
    const models = [makeModel('huge-model', { code: 0.9 }, {
      total_params_b: 671, active_params_b: 37, is_moe: true,
      quant_options: hugeQuants,
    })]
    const result = scoreLocalModels(scored, models, 'code')
    expect(result.recommendations).toHaveLength(0)
  })

  it('includes viable local models with correct hardware tier', () => {
    const scored = [makeScoredModel('small-model')]
    const models = [makeModel('small-model', { code: 0.8 }, {
      total_params_b: 8, active_params_b: null, is_moe: false,
      quant_options: smallQuants,
    })]
    const result = scoreLocalModels(scored, models, 'code')
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0].hardwareTier.id).toBe('consumer_laptop')
    expect(result.recommendations[0].bestQuant.quant).toBe('Q4_K_M')
  })

  it('calculates effective quality as task_fitness * (1 - quality_penalty)', () => {
    const scored = [makeScoredModel('test-model')]
    const models = [makeModel('test-model', { code: 0.8 }, {
      total_params_b: 8, active_params_b: null, is_moe: false,
      quant_options: smallQuants,
    })]
    const result = scoreLocalModels(scored, models, 'code')
    // 0.8 * (1 - 0.05) = 0.76
    expect(result.recommendations[0].effectiveQuality).toBeCloseTo(0.76, 2)
  })

  it('sorts by effective quality descending', () => {
    const scored = [
      makeScoredModel('model-a'),
      makeScoredModel('model-b'),
    ]
    const models = [
      makeModel('model-a', { code: 0.6 }, {
        total_params_b: 8, active_params_b: null, is_moe: false,
        quant_options: smallQuants,
      }),
      makeModel('model-b', { code: 0.9 }, {
        total_params_b: 8, active_params_b: null, is_moe: false,
        quant_options: smallQuants,
      }),
    ]
    const result = scoreLocalModels(scored, models, 'code')
    expect(result.recommendations[0].model.slug).toBe('model-b')
    expect(result.recommendations[1].model.slug).toBe('model-a')
  })

  it('limits to max 2 per hardware tier', () => {
    const scored = Array.from({ length: 4 }, (_, i) => makeScoredModel(`m${i}`))
    const models = scored.map((s, i) =>
      makeModel(s.slug, { code: 0.9 - i * 0.05 }, {
        total_params_b: 8, active_params_b: null, is_moe: false,
        quant_options: smallQuants,
      })
    )
    const result = scoreLocalModels(scored, models, 'code')
    const consumerCount = result.recommendations.filter(
      r => r.hardwareTier.id === 'consumer_laptop'
    ).length
    expect(consumerCount).toBeLessThanOrEqual(2)
  })

  it('reports correct tiers used in tier order', () => {
    const scored = [makeScoredModel('small'), makeScoredModel('large')]
    const models = [
      makeModel('small', { code: 0.8 }, {
        total_params_b: 8, active_params_b: null, is_moe: false,
        quant_options: smallQuants,
      }),
      makeModel('large', { code: 0.85 }, {
        total_params_b: 70, active_params_b: null, is_moe: false,
        quant_options: largeQuants,
      }),
    ]
    const result = scoreLocalModels(scored, models, 'code')
    expect(result.tiersUsed.length).toBe(2)
    // Tiers should be in order: consumer_laptop before workstation
    const tierIds = result.tiersUsed.map(t => t.id)
    expect(tierIds.indexOf('consumer_laptop')).toBeLessThan(tierIds.indexOf('workstation'))
  })
})
