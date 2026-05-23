import { describe, it, expect } from 'vitest'
import { scoreModels, scoreModelsDetailed, hardFilter, costScore, estimateCost } from '../scoring'
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
    const normalOpus = normal.findIndex(m => m.slug === 'claude-opus-4.7')
    const focusedOpus = focused.findIndex(m => m.slug === 'claude-opus-4.7')
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
  const opus = getModel('claude-opus-4.7')!

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
    const opus = getModel('claude-opus-4.7')!
    const opusCurated = opus.task_fitness['code'] ?? 0.5
    const results = scoreModels({ ...baseInput, complexity: 'complex' })
    const opusResult = results.find(m => m.slug === 'claude-opus-4.7')!
    expect(opusResult.factorScores.quality).toBeCloseTo(opusCurated, 6)
  })
})

describe('reasoning multiplier (Phase 3.2)', () => {
  // Use a moderate-complexity, non-code task to avoid interaction with the
  // tier-floor demotion. Opus has extended_thinking; gpt-5.4-mini does not.
  const baseInput = {
    taskType: 'analyse',
    complexity: 'moderate',
    inputLength: 'medium',
    needsVision: false,
    needsTools: false,
    needsCode: false,
    priorityOrder: defaultPriority,
  }

  const opus = getModel('claude-opus-4.7')!
  const opusCurated = opus.task_fitness['analyse'] ?? 0.5

  it('boosts quality by 1.20 on a reasoning-capable flagship when needsReasoning=true', () => {
    const results = scoreModels({ ...baseInput, needsReasoning: true })
    const opusResult = results.find(m => m.slug === 'claude-opus-4.7')!
    expect(opusResult.factorScores.quality).toBeCloseTo(opusCurated * 1.20, 6)
  })

  it('leaves quality unchanged when needsReasoning is false (or omitted)', () => {
    const results = scoreModels({ ...baseInput, needsReasoning: false })
    const opusResult = results.find(m => m.slug === 'claude-opus-4.7')!
    expect(opusResult.factorScores.quality).toBeCloseTo(opusCurated, 6)
  })

  it('does not boost models without extended_thinking even when needsReasoning=true', () => {
    // gpt-5.4-mini does not list extended_thinking in its capabilities.
    const mini = getModel('gpt-5.4-mini')!
    const miniCurated = mini.task_fitness['analyse'] ?? 0.5
    const results = scoreModels({ ...baseInput, needsReasoning: true })
    const miniResult = results.find(m => m.slug === 'gpt-5.4-mini')!
    expect(miniResult.factorScores.quality).toBeCloseTo(miniCurated, 6)
  })
})

describe('data_sensitivity (Phase 4.1)', () => {
  const baseInput = {
    taskType: 'analyse',
    complexity: 'moderate',
    inputLength: 'medium',
    needsVision: false,
    needsTools: false,
    needsCode: false,
    priorityOrder: defaultPriority,
  }

  it('hard-filters to only locally deployable models when on_prem_required', () => {
    const results = scoreModels({ ...baseInput, dataSensitivity: 'on_prem_required' })
    // Every surviving model must have local_info populated in the registry.
    for (const m of results) {
      const reg = getModel(m.slug)!
      expect(reg.local_info).toBeDefined()
    }
    // Spot-check a known-hosted model is excluded.
    const opus = results.find(m => m.slug === 'claude-opus-4.7')
    expect(opus).toBeUndefined()
    // Spot-check a known-local model survives.
    const llama = results.find(m => m.slug === 'llama-4-maverick')
    expect(llama).toBeDefined()
  })

  it('boosts privacy by 1.5× for regulated_health', () => {
    const opus = getModel('claude-opus-4.7')!
    const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-opus-4.7')!
    const boosted = scoreModels({ ...baseInput, dataSensitivity: 'regulated_health' })
      .find(m => m.slug === 'claude-opus-4.7')!
    expect(boosted.factorScores.privacy).toBeCloseTo(opus.privacy_score * 1.5, 6)
    expect(boosted.factorScores.privacy).toBeGreaterThan(baseline.factorScores.privacy)
  })

  it('boosts privacy by 1.5× for regulated_finance', () => {
    const opus = getModel('claude-opus-4.7')!
    const boosted = scoreModels({ ...baseInput, dataSensitivity: 'regulated_finance' })
      .find(m => m.slug === 'claude-opus-4.7')!
    expect(boosted.factorScores.privacy).toBeCloseTo(opus.privacy_score * 1.5, 6)
  })

  it('boosts privacy by 1.2× for pii', () => {
    const opus = getModel('claude-opus-4.7')!
    const boosted = scoreModels({ ...baseInput, dataSensitivity: 'pii' })
      .find(m => m.slug === 'claude-opus-4.7')!
    expect(boosted.factorScores.privacy).toBeCloseTo(opus.privacy_score * 1.2, 6)
  })

  it('leaves privacy unchanged when dataSensitivity is none or omitted', () => {
    const opus = getModel('claude-opus-4.7')!
    const noneResult = scoreModels({ ...baseInput, dataSensitivity: 'none' })
      .find(m => m.slug === 'claude-opus-4.7')!
    const omittedResult = scoreModels(baseInput).find(m => m.slug === 'claude-opus-4.7')!
    expect(noneResult.factorScores.privacy).toBeCloseTo(opus.privacy_score, 6)
    expect(omittedResult.factorScores.privacy).toBeCloseTo(opus.privacy_score, 6)
  })
})

describe('latency_target (Phase 4.2)', () => {
  const baseInput = {
    taskType: 'conversation',
    complexity: 'simple',
    inputLength: 'short',
    needsVision: false,
    needsTools: false,
    needsCode: false,
    priorityOrder: defaultPriority,
  }

  it('hard-filters to models with speed_score >= 0.85 when realtime', () => {
    const results = scoreModels({ ...baseInput, latencyTarget: 'realtime' })
    for (const m of results) {
      const reg = getModel(m.slug)!
      expect(reg.speed_score).toBeGreaterThanOrEqual(0.85)
    }
    // Slow flagship excluded.
    expect(results.find(m => m.slug === 'claude-opus-4.7')).toBeUndefined()
    // Fast model survives.
    expect(results.find(m => m.slug === 'gemini-2.5-flash-lite')).toBeDefined()
  })

  it('boosts cost factor by 1.3× when latency_target=batch', () => {
    const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-opus-4.7')!
    const batched = scoreModels({ ...baseInput, latencyTarget: 'batch' })
      .find(m => m.slug === 'claude-opus-4.7')!
    expect(batched.factorScores.cost).toBeCloseTo(baseline.factorScores.cost * 1.3, 6)
  })

  it('leaves cost unchanged for interactive (default) latency', () => {
    const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-opus-4.7')!
    const interactive = scoreModels({ ...baseInput, latencyTarget: 'interactive' })
      .find(m => m.slug === 'claude-opus-4.7')!
    expect(interactive.factorScores.cost).toBeCloseTo(baseline.factorScores.cost, 6)
  })
})

describe('volume (Phase 4.3)', () => {
  const baseInput = {
    taskType: 'extract',
    complexity: 'moderate',
    inputLength: 'medium',
    needsVision: false,
    needsTools: false,
    needsCode: false,
    priorityOrder: defaultPriority,
  }

  it('boosts cost factor by 1.6× for millions_per_day', () => {
    const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-opus-4.7')!
    const millions = scoreModels({ ...baseInput, volume: 'millions_per_day' })
      .find(m => m.slug === 'claude-opus-4.7')!
    expect(millions.factorScores.cost).toBeCloseTo(baseline.factorScores.cost * 1.6, 6)
  })

  it('boosts cost factor by 1.3× for thousands_per_day', () => {
    const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-opus-4.7')!
    const thousands = scoreModels({ ...baseInput, volume: 'thousands_per_day' })
      .find(m => m.slug === 'claude-opus-4.7')!
    expect(thousands.factorScores.cost).toBeCloseTo(baseline.factorScores.cost * 1.3, 6)
  })

  it('leaves cost unchanged for one_off (default) volume', () => {
    const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-opus-4.7')!
    const oneOff = scoreModels({ ...baseInput, volume: 'one_off' })
      .find(m => m.slug === 'claude-opus-4.7')!
    expect(oneOff.factorScores.cost).toBeCloseTo(baseline.factorScores.cost, 6)
  })

  it('uses max() not multiplication when batch latency stacks with millions volume', () => {
    const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-opus-4.7')!
    const stacked = scoreModels({
      ...baseInput,
      latencyTarget: 'batch',
      volume: 'millions_per_day',
    }).find(m => m.slug === 'claude-opus-4.7')!
    // Expected: max(1.3, 1.6) = 1.6 (NOT 1.3 * 1.6 = 2.08).
    expect(stacked.factorScores.cost).toBeCloseTo(baseline.factorScores.cost * 1.6, 6)
    expect(stacked.factorScores.cost).not.toBeCloseTo(baseline.factorScores.cost * 1.3 * 1.6, 4)
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

describe('needs_long_context (Phase 4.4)', () => {
  const baseInput = {
    taskType: 'summarise',
    complexity: 'moderate',
    inputLength: 'very_long',
    needsVision: false,
    needsTools: false,
    needsCode: false,
    priorityOrder: defaultPriority,
  }

  it('hard-filters models with context_window < 100k when needsLongContext=true', () => {
    const results = scoreModels({ ...baseInput, needsLongContext: true })
    expect(results.length).toBeGreaterThan(0)
    for (const m of results) {
      const reg = getModel(m.slug)!
      expect(reg.context_window).toBeGreaterThanOrEqual(100_000)
    }
  })

  it('keeps known long-context flagships when needsLongContext=true', () => {
    const results = scoreModels({ ...baseInput, needsLongContext: true })
    // Gemini 2.5 Pro and Sonnet 4.6 are flagship long-context models — they
    // should still be present after the filter.
    const sonnet = results.find(m => m.slug === 'claude-sonnet-4.6')
    expect(sonnet).toBeDefined()
  })

  it('does not filter when needsLongContext is false (or omitted)', () => {
    const filtered = scoreModels({ ...baseInput, needsLongContext: true })
    const unfiltered = scoreModels({ ...baseInput, needsLongContext: false })
    // Unfiltered should include at least as many models as filtered, and
    // generally more (any model with context_window < 100k drops out).
    expect(unfiltered.length).toBeGreaterThanOrEqual(filtered.length)
  })
})

describe('needs_multilingual (Phase 4.5a)', () => {
  const baseInput = {
    taskType: 'translate',
    complexity: 'moderate',
    inputLength: 'medium',
    needsVision: false,
    needsTools: false,
    needsCode: false,
    priorityOrder: defaultPriority,
  }

  // Find a multilingual-capable model and a non-multilingual one for asymmetric checks.
  const multilingualModel = getAllModels().find(m => m.capabilities.includes('multilingual'))!
  const nonMultilingualModel = getAllModels().find(m => !m.capabilities.includes('multilingual'))!

  it('boosts quality by 1.10× on a multilingual-capable model when needsMultilingual=true', () => {
    const baseline = scoreModels(baseInput).find(m => m.slug === multilingualModel.slug)!
    const boosted = scoreModels({ ...baseInput, needsMultilingual: true })
      .find(m => m.slug === multilingualModel.slug)!
    expect(boosted.factorScores.quality).toBeCloseTo(baseline.factorScores.quality * 1.10, 6)
  })

  it('leaves quality unchanged on a non-multilingual model even when needsMultilingual=true', () => {
    const baseline = scoreModels(baseInput).find(m => m.slug === nonMultilingualModel.slug)!
    const boosted = scoreModels({ ...baseInput, needsMultilingual: true })
      .find(m => m.slug === nonMultilingualModel.slug)!
    expect(boosted.factorScores.quality).toBeCloseTo(baseline.factorScores.quality, 6)
  })

  it('leaves quality unchanged when needsMultilingual is false regardless of capability', () => {
    const baseline = scoreModels(baseInput).find(m => m.slug === multilingualModel.slug)!
    const noFlag = scoreModels({ ...baseInput, needsMultilingual: false })
      .find(m => m.slug === multilingualModel.slug)!
    expect(noFlag.factorScores.quality).toBeCloseTo(baseline.factorScores.quality, 6)
  })
})

describe('is_agentic (Phase 4.5b)', () => {
  const baseInput = {
    taskType: 'analyse',
    complexity: 'moderate',
    inputLength: 'medium',
    needsVision: false,
    needsTools: false, // not a hard filter; just a capability hint to scoreModels
    needsCode: false,
    priorityOrder: defaultPriority,
  }

  // Opus has both tools and extended_thinking — the canonical agentic host.
  const opus = getModel('claude-opus-4.7')!
  const opusHasBoth = opus.capabilities.includes('tools') && opus.capabilities.includes('extended_thinking')

  it('boosts quality by 1.15× when isAgentic=true and model has both tools + extended_thinking', () => {
    expect(opusHasBoth).toBe(true)
    const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-opus-4.7')!
    const boosted = scoreModels({ ...baseInput, isAgentic: true })
      .find(m => m.slug === 'claude-opus-4.7')!
    expect(boosted.factorScores.quality).toBeCloseTo(baseline.factorScores.quality * 1.15, 6)
  })

  it('leaves quality unchanged when model has tools but no extended_thinking', () => {
    // Find a model with tools but NOT extended_thinking.
    const toolsOnly = getAllModels().find(
      m => m.capabilities.includes('tools') && !m.capabilities.includes('extended_thinking')
    )
    if (!toolsOnly) return // skip silently if registry doesn't have such a model
    const baseline = scoreModels(baseInput).find(m => m.slug === toolsOnly.slug)!
    const boosted = scoreModels({ ...baseInput, isAgentic: true })
      .find(m => m.slug === toolsOnly.slug)!
    expect(boosted.factorScores.quality).toBeCloseTo(baseline.factorScores.quality, 6)
  })

  it('leaves quality unchanged when model has extended_thinking but no tools', () => {
    const thinkingOnly = getAllModels().find(
      m => m.capabilities.includes('extended_thinking') && !m.capabilities.includes('tools')
    )
    if (!thinkingOnly) return
    const baseline = scoreModels(baseInput).find(m => m.slug === thinkingOnly.slug)!
    const boosted = scoreModels({ ...baseInput, isAgentic: true })
      .find(m => m.slug === thinkingOnly.slug)!
    expect(boosted.factorScores.quality).toBeCloseTo(baseline.factorScores.quality, 6)
  })

  it('leaves quality unchanged when isAgentic is false', () => {
    const baseline = scoreModels(baseInput).find(m => m.slug === 'claude-opus-4.7')!
    const noFlag = scoreModels({ ...baseInput, isAgentic: false })
      .find(m => m.slug === 'claude-opus-4.7')!
    expect(noFlag.factorScores.quality).toBeCloseTo(baseline.factorScores.quality, 6)
  })
})

describe('output_length cost separation (Phase 4.6)', () => {
  const opus = getModel('claude-opus-4.7')!

  it('estimateCost reflects higher output tokens for longer outputs (same input)', () => {
    const shortOut = estimateCost(opus, 'short', 'short')
    const veryLongOut = estimateCost(opus, 'short', 'very_long')
    // very_long output (16k tokens) costs much more than short output (100 tokens)
    // for the same input — the output term dominates.
    expect(veryLongOut).toBeGreaterThan(shortOut)
  })

  it('estimateCost defaults to medium output when outputLength is omitted', () => {
    const defaulted = estimateCost(opus, 'medium')
    const explicit = estimateCost(opus, 'medium', 'medium')
    expect(defaulted).toBeCloseTo(explicit, 9)
  })

  it('cost factor reflects output_length difference between two scoreModels calls', () => {
    const baseInput = {
      taskType: 'generate',
      complexity: 'moderate',
      inputLength: 'short' as const,
      needsVision: false,
      needsTools: false,
      needsCode: false,
      priorityOrder: defaultPriority,
    }
    // Using Opus (expensive) should produce a lower cost score with very_long
    // output than with short output, because relative to other models the
    // output-token cost dominates.
    const shortOut = scoreModels({ ...baseInput, outputLength: 'short' }).find(m => m.slug === 'claude-opus-4.7')!
    const veryLongOut = scoreModels({ ...baseInput, outputLength: 'very_long' }).find(m => m.slug === 'claude-opus-4.7')!
    // estimatedCost should differ noticeably.
    expect(veryLongOut.estimatedCost).toBeGreaterThan(shortOut.estimatedCost)
  })
})

describe('hardFilter (Phase 5.1)', () => {
  const baseInput = {
    taskType: 'analyse',
    complexity: 'moderate',
    inputLength: 'medium',
    needsVision: false,
    needsTools: false,
    needsCode: false,
    priorityOrder: defaultPriority,
  }

  it('rejects models below the long-context threshold when needsLongContext', () => {
    // Synthetic stub — registry models all sit above 100k today, so we mint one.
    const small = { ...getModel('claude-opus-4.7')!, context_window: 32_000 }
    const result = hardFilter(small, { ...baseInput, needsLongContext: true })
    expect(result).toEqual({ ok: false, reason: 'long_context' })
  })

  it('admits models above the threshold when needsLongContext', () => {
    const big = getAllModels().find(m => m.context_window >= 100_000)!
    const result = hardFilter(big, { ...baseInput, needsLongContext: true })
    expect(result.ok).toBe(true)
  })

  it('rejects cloud-only models when on_prem_required', () => {
    const cloudOnly = getAllModels().find(m => !m.local_info)!
    const result = hardFilter(cloudOnly, { ...baseInput, dataSensitivity: 'on_prem_required' })
    expect(result).toEqual({ ok: false, reason: 'on_prem_required' })
  })

  it('rejects slow models when latencyTarget=realtime', () => {
    const slow = getAllModels().find(m => m.speed_score < 0.85)!
    const result = hardFilter(slow, { ...baseInput, latencyTarget: 'realtime' })
    expect(result).toEqual({ ok: false, reason: 'realtime' })
  })

  it('rejects models without vision when needsVision', () => {
    const noVision = getAllModels().find(m => !m.capabilities.includes('vision'))!
    const result = hardFilter(noVision, { ...baseInput, needsVision: true })
    expect(result).toEqual({ ok: false, reason: 'missing_vision' })
  })

  it('rejects models without tools when needsTools', () => {
    const opus = getModel('claude-opus-4.7')!
    const noTools = { ...opus, capabilities: opus.capabilities.filter(c => c !== 'tools') }
    const result = hardFilter(noTools, { ...baseInput, needsTools: true })
    expect(result).toEqual({ ok: false, reason: 'missing_tools' })
  })

  it('rejects models without code when needsCode', () => {
    const opus = getModel('claude-opus-4.7')!
    const noCode = { ...opus, capabilities: opus.capabilities.filter(c => c !== 'code') }
    const result = hardFilter(noCode, { ...baseInput, needsCode: true })
    expect(result).toEqual({ ok: false, reason: 'missing_code' })
  })

  it('admits a fully-capable model with no constraints', () => {
    const opus = getModel('claude-opus-4.7')!
    expect(hardFilter(opus, baseInput)).toEqual({ ok: true })
  })

  // v0.9 — model_class routing
  it('rejects chat models on an embedding task', () => {
    const opus = getModel('claude-opus-4.7')!
    const result = hardFilter(opus, { ...baseInput, taskType: 'embedding' })
    expect(result).toEqual({ ok: false, reason: 'wrong_class' })
  })

  it('rejects embedding models on a non-embedding task', () => {
    // No seeded embedding models yet (phase 3), so synthesise one inline.
    const opus = getModel('claude-opus-4.7')!
    const stubEmbedding = { ...opus, model_class: 'embedding' as const }
    const result = hardFilter(stubEmbedding, baseInput) // taskType = 'analyse'
    expect(result).toEqual({ ok: false, reason: 'wrong_class' })
  })

  it('admits an embedding model on an embedding task', () => {
    const opus = getModel('claude-opus-4.7')!
    const stubEmbedding = { ...opus, model_class: 'embedding' as const }
    const result = hardFilter(stubEmbedding, { ...baseInput, taskType: 'embedding' })
    expect(result).toEqual({ ok: true })
  })

  it('class filter runs before capability gates (no missing_vision on an embedding mismatch)', () => {
    // A chat model that lacks vision being scored on an embedding task with
    // needsVision=true should report wrong_class — not missing_vision —
    // because class routing is the dominant rejection reason.
    const opus = getModel('claude-opus-4.7')!
    const noVision = { ...opus, capabilities: opus.capabilities.filter(c => c !== 'vision') }
    const result = hardFilter(noVision, { ...baseInput, taskType: 'embedding', needsVision: true })
    expect(result).toEqual({ ok: false, reason: 'wrong_class' })
  })
})

describe('scoreModelsDetailed (Phase 5.1)', () => {
  it('returns excluded models with reasons alongside the scored set', () => {
    const result = scoreModelsDetailed({
      taskType: 'analyse',
      complexity: 'moderate',
      inputLength: 'medium',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      priorityOrder: defaultPriority,
      dataSensitivity: 'on_prem_required',
    })
    expect(result.excluded.length).toBeGreaterThan(0)
    expect(result.excluded.every(e => e.reason === 'on_prem_required')).toBe(true)
    expect(result.models.every(m => {
      const model = getModel(m.slug)!
      return !!model.local_info
    })).toBe(true)
  })

  it('produces the same ordered models as scoreModels()', () => {
    const input = {
      taskType: 'analyse',
      complexity: 'moderate',
      inputLength: 'medium',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      priorityOrder: defaultPriority,
    }
    const flat = scoreModels(input).map(m => m.slug)
    const detailed = scoreModelsDetailed(input).models.map(m => m.slug)
    expect(detailed).toEqual(flat)
  })
})
