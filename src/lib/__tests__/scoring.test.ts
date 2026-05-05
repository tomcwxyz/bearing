import { describe, it, expect } from 'vitest'
import { scoreModels } from '../scoring'
import type { Factor } from '../registry'

const defaultPriority: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']

describe('scoreModels', () => {
  it('returns scored models sorted by weightedScore descending', () => {
    const results = scoreModels({
      taskType: 'code',
      complexity: 'moderate',
      inputLength: 'medium',
      needsVision: false,
      needsTools: false,
      needsCode: true,
      priorityOrder: defaultPriority,
    })
    expect(results.length).toBeGreaterThan(0)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].weightedScore).toBeGreaterThanOrEqual(results[i].weightedScore)
    }
  })

  it('excludes models that lack required capabilities (vision)', () => {
    const results = scoreModels({
      taskType: 'vision',
      complexity: 'simple',
      inputLength: 'short',
      needsVision: true,
      needsTools: false,
      needsCode: false,
      priorityOrder: defaultPriority,
    })
    // DeepSeek V3.1 has no vision — should be excluded
    const deepseek = results.find(m => m.slug === 'deepseek-v3.1')
    expect(deepseek).toBeUndefined()
    // Claude Sonnet 4.6 has vision — should be included
    const sonnet = results.find(m => m.slug === 'claude-sonnet-4.6')
    expect(sonnet).toBeDefined()
  })

  it('includes estimatedCost based on task input length', () => {
    const results = scoreModels({
      taskType: 'summarise',
      complexity: 'simple',
      inputLength: 'short',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      priorityOrder: defaultPriority,
    })
    for (const model of results) {
      expect(model.estimatedCost).toBeDefined()
      expect(model.estimatedCost).toBeGreaterThan(0)
    }
  })

  it('returns factorScores for each model with all 7 factors', () => {
    const results = scoreModels({
      taskType: 'generate',
      complexity: 'complex',
      inputLength: 'long',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      priorityOrder: defaultPriority,
    })
    const factors: Factor[] = ['cost', 'speed', 'quality', 'privacy', 'sustainability', 'transparency', 'capability']
    for (const model of results) {
      for (const factor of factors) {
        expect(model.factorScores[factor]).toBeDefined()
        expect(model.factorScores[factor]).toBeGreaterThanOrEqual(0)
        expect(model.factorScores[factor]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('exclusions improve ranking for frontier models on complex tasks', () => {
    const priorityOrder: Factor[] = ['quality', 'capability', 'speed', 'privacy', 'sustainability', 'transparency', 'cost']
    const normal = scoreModels({
      taskType: 'code', complexity: 'complex', inputLength: 'long',
      needsVision: false, needsTools: true, needsCode: true,
      priorityOrder,
    })
    const focused = scoreModels({
      taskType: 'code', complexity: 'complex', inputLength: 'long',
      needsVision: false, needsTools: true, needsCode: true,
      priorityOrder,
      excludedFactors: ['sustainability', 'transparency', 'privacy'],
    })
    const normalOpus = normal.findIndex(m => m.slug === 'claude-opus-4.6')
    const focusedOpus = focused.findIndex(m => m.slug === 'claude-opus-4.6')
    expect(focusedOpus).toBeLessThan(normalOpus)
  })

  it('ranks cost-sensitive priorities differently', () => {
    const costFirst: Factor[] = ['cost', 'speed', 'quality', 'capability', 'transparency', 'privacy', 'sustainability']
    const qualityFirst: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const costResults = scoreModels({
      taskType: 'summarise', complexity: 'simple', inputLength: 'short',
      needsVision: false, needsTools: false, needsCode: false,
      priorityOrder: costFirst,
    })
    const qualityResults = scoreModels({
      taskType: 'summarise', complexity: 'simple', inputLength: 'short',
      needsVision: false, needsTools: false, needsCode: false,
      priorityOrder: qualityFirst,
    })
    // Different priority orders should produce different #1 picks (or at least different scores)
    expect(costResults[0].weightedScore).not.toBeCloseTo(qualityResults[0].weightedScore, 3)
  })
})

describe('benchmark blending', () => {
  const baseInput = {
    taskType: 'code',
    complexity: 'moderate',
    inputLength: 'medium',
    needsVision: false,
    needsTools: false,
    needsCode: true,
    priorityOrder: defaultPriority,
  }

  it('does nothing when blend is 0 (default)', () => {
    delete process.env.BENCHMARK_BLEND
    const benchmarkScores = new Map<string, number>([['claude-sonnet-4.6::code', 0.0]])
    const without = scoreModels(baseInput)
    const withMap = scoreModels({ ...baseInput, benchmarkScores })
    const a = without.find(m => m.slug === 'claude-sonnet-4.6')!
    const b = withMap.find(m => m.slug === 'claude-sonnet-4.6')!
    expect(a.factorScores.quality).toBeCloseTo(b.factorScores.quality, 6)
  })

  it('blends curated and benchmark when blend > 0 and delta within threshold', () => {
    process.env.BENCHMARK_BLEND = '0.5'
    try {
      // claude-sonnet-4.6 code curated ≈ 0.93. Pick a benchmark within 0.10
      // so the skip rule doesn't fire and we actually exercise blending.
      const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-sonnet-4.6')!
      const benchmarkVal = baseline.factorScores.quality - 0.05
      const benchmarkScores = new Map<string, number>([['claude-sonnet-4.6::code', benchmarkVal]])
      const blended = scoreModels({ ...baseInput, benchmarkScores }).find(m => m.slug === 'claude-sonnet-4.6')!
      expect(blended.factorScores.quality).toBeLessThan(baseline.factorScores.quality)
      expect(blended.factorScores.quality).toBeCloseTo(
        baseline.factorScores.quality * 0.5 + benchmarkVal * 0.5,
        5,
      )
    } finally {
      delete process.env.BENCHMARK_BLEND
    }
  })

  it('skips the blend when |curated − benchmark| exceeds the skip threshold', () => {
    process.env.BENCHMARK_BLEND = '0.5'
    try {
      // Curated for claude-sonnet-4.6 code is ~0.93. A benchmark of 0.0 gives
      // |delta| ≈ 0.93, well above 0.10 — the blend must be skipped, leaving
      // quality identical to the curated baseline (no benchmarkScores).
      const benchmarkScores = new Map<string, number>([['claude-sonnet-4.6::code', 0.0]])
      const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-sonnet-4.6')!
      const result = scoreModels({ ...baseInput, benchmarkScores }).find(m => m.slug === 'claude-sonnet-4.6')!
      expect(result.factorScores.quality).toBeCloseTo(baseline.factorScores.quality, 6)
    } finally {
      delete process.env.BENCHMARK_BLEND
    }
  })

  it('applies the blend at the threshold boundary (delta ≤ 0.10)', () => {
    process.env.BENCHMARK_BLEND = '0.5'
    try {
      const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-sonnet-4.6')!
      // Delta exactly 0.10 — should still blend (threshold is strict >).
      const benchmarkVal = baseline.factorScores.quality - 0.10
      const benchmarkScores = new Map<string, number>([['claude-sonnet-4.6::code', benchmarkVal]])
      const blended = scoreModels({ ...baseInput, benchmarkScores }).find(m => m.slug === 'claude-sonnet-4.6')!
      expect(blended.factorScores.quality).toBeCloseTo(
        baseline.factorScores.quality * 0.5 + benchmarkVal * 0.5,
        5,
      )
      expect(blended.factorScores.quality).toBeLessThan(baseline.factorScores.quality)
    } finally {
      delete process.env.BENCHMARK_BLEND
    }
  })

  it('falls back to curated when no benchmark row exists for the model', () => {
    process.env.BENCHMARK_BLEND = '1.0'
    try {
      const benchmarkScores = new Map<string, number>() // empty
      const result = scoreModels({ ...baseInput, benchmarkScores }).find(m => m.slug === 'claude-sonnet-4.6')!
      const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-sonnet-4.6')!
      expect(result.factorScores.quality).toBeCloseTo(baseline.factorScores.quality, 6)
    } finally {
      delete process.env.BENCHMARK_BLEND
    }
  })
})
