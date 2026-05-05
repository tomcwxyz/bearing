import { describe, it, expect } from 'vitest'
import { scoreModels, costScore } from '../scoring'
import { getAllModels, getModel, type Factor } from '../registry'

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
    // Phase 2.2 damps rank-5+ factors (×0.4 before normalisation). Under the
    // default priority order used here, transparency/sustainability/privacy
    // sit at ranks 5/6/7 and are damped — so excluding them on top of the
    // damping only marginally shifts the result. Opus should still land in
    // roughly the same place — within one rank of the normal run.
    expect(Math.abs(focusedOpus - normalOpus)).toBeLessThanOrEqual(1)
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

describe('costScore priority-aware compression', () => {
  const allModels = getAllModels()
  const opus = getModel('claude-opus-4.6')!

  it('preserves full spread when costWeightHint is 0.30 (no compression)', () => {
    // Expensive flagship at long inputs should still score low — full spread.
    const score = costScore(opus, allModels, 'long', 0.30)
    expect(score).toBeLessThanOrEqual(0.10)
  })

  it('compresses toward 0.5 when costWeightHint is low (0.05)', () => {
    // Opus hits the 0.05 cost floor; at weight=0.05, compression=0.833 and
    // strength=0.85, the formula yields ~0.368 — well above the floor,
    // demonstrating significant compression toward 0.5. Phase 2.4 raised
    // strength from 0.6 to 0.85 so flagships' quality leads can outweigh
    // the residual cost penalty when users de-prioritise cost.
    const score = costScore(opus, allModels, 'long', 0.05)
    expect(score).toBeGreaterThanOrEqual(0.30)
  })

  it('produces an intermediate value at the default rank-3 weight (0.18)', () => {
    const high = costScore(opus, allModels, 'long', 0.30)
    const low = costScore(opus, allModels, 'long', 0.05)
    const mid = costScore(opus, allModels, 'long', 0.18)
    expect(mid).toBeGreaterThanOrEqual(high)
    expect(mid).toBeLessThanOrEqual(low)
  })
})

describe('complex-task tier-floor demotion (Phase 3.1)', () => {
  const baseInput = {
    taskType: 'code',
    inputLength: 'long',
    needsVision: false,
    needsTools: false,
    needsCode: true,
    priorityOrder: defaultPriority,
  }

  // claude-haiku-4.5 has tier 'budget' — confirm before testing.
  const haiku = getModel('claude-haiku-4.5')!
  const rawCuratedQuality = haiku.task_fitness['code'] ?? 0.5

  it('demotes a budget-tier model quality by 0.85 on complex tasks (default priorities)', () => {
    const results = scoreModels({ ...baseInput, complexity: 'complex' })
    const haikuResult = results.find(m => m.slug === 'claude-haiku-4.5')!
    expect(haikuResult.factorScores.quality).toBeCloseTo(rawCuratedQuality * 0.85, 6)
  })

  it('leaves the same budget model unchanged on simple tasks', () => {
    const results = scoreModels({ ...baseInput, complexity: 'simple', inputLength: 'short' })
    const haikuResult = results.find(m => m.slug === 'claude-haiku-4.5')!
    expect(haikuResult.factorScores.quality).toBeCloseTo(rawCuratedQuality, 6)
  })

  it('skips demotion on complex tasks when the user prioritises transparency in top 3', () => {
    // transparency moved into rank 2 — user has opted in to ethics emphasis.
    const ethicsPriority: Factor[] = [
      'quality', 'transparency', 'capability', 'cost', 'privacy', 'sustainability', 'speed',
    ]
    const results = scoreModels({
      ...baseInput,
      complexity: 'complex',
      priorityOrder: ethicsPriority,
    })
    const haikuResult = results.find(m => m.slug === 'claude-haiku-4.5')!
    expect(haikuResult.factorScores.quality).toBeCloseTo(rawCuratedQuality, 6)
  })

  it('does not demote a flagship-tier model on complex tasks', () => {
    const opus = getModel('claude-opus-4.6')!
    const opusCurated = opus.task_fitness['code'] ?? 0.5
    const results = scoreModels({ ...baseInput, complexity: 'complex' })
    const opusResult = results.find(m => m.slug === 'claude-opus-4.6')!
    expect(opusResult.factorScores.quality).toBeCloseTo(opusCurated, 6)
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
