import { ALL_TASK_TYPES, getAllModels, type Factor, type Model } from './registry'
import { priorityToWeights } from './weights'

export interface ScoringInput {
  taskType: string
  complexity: string
  inputLength: string
  needsVision: boolean
  needsTools: boolean
  needsCode: boolean
  needsReasoning?: boolean
  // Phase 4 batch A: classification dimensions that influence hard filters and
  // factor-score multipliers (NOT weight multipliers — see notes on each).
  dataSensitivity?: string
  latencyTarget?: string
  volume?: string
  // Phase 4 batch B: long-context hard filter, multilingual + agentic quality
  // multipliers, and a separate output-length axis for cost estimation.
  needsLongContext?: boolean
  needsMultilingual?: boolean
  isAgentic?: boolean
  outputLength?: string
  priorityOrder: Factor[]
  excludedFactors?: string[]
  // Optional map keyed by `${bearing_slug}::${taskType}` → 0..1 normalised
  // benchmark mean. When present and a model+task has an entry, the quality
  // score is blended with curated task_fitness via BENCHMARK_BLEND (env, 0..1,
  // default 0 = curated only). Sync injection keeps scoring testable.
  benchmarkScores?: Map<string, number>
}

export interface ScoredModel {
  slug: string
  name: string
  provider: string
  tier: string
  weightedScore: number
  factorScores: Record<Factor, number>
  estimatedCost: number
  capabilities: string[]
  strengths: string[]
  weaknesses: string[]
  contextWindow: number
}

// Phase 4.6: input and output token estimates are decoupled because the two
// often differ (e.g. "summarise a 200-page report into a 2-page brief" — long
// input, medium output; "write a 1500-word story" — short input, long output).
// Callers that don't pass outputLength get medium output (1000 tokens), which
// matches the previous default behaviour for backward compatibility.
const INPUT_TOKEN_ESTIMATES: Record<string, number> = {
  short: 500,
  medium: 2000,
  long: 8000,
  very_long: 32000,
}
const OUTPUT_TOKEN_ESTIMATES: Record<string, number> = {
  short: 100,
  medium: 1000,
  long: 4000,
  very_long: 16000,
}

export function estimateCost(model: Model, inputLength: string, outputLength: string = 'medium'): number {
  const inputTokens = INPUT_TOKEN_ESTIMATES[inputLength] ?? INPUT_TOKEN_ESTIMATES.medium
  const outputTokens = OUTPUT_TOKEN_ESTIMATES[outputLength] ?? OUTPUT_TOKEN_ESTIMATES.medium
  const inputCost = (inputTokens / 1_000_000) * model.pricing.input_per_1m
  const outputCost = (outputTokens / 1_000_000) * model.pricing.output_per_1m
  return inputCost + outputCost
}

// Log-scale cost scoring with floor — prevents the most expensive model
// from scoring a flat zero, which would make it unrecommendable even when
// cost is the user's lowest priority.
const COST_SCORE_FLOOR = 0.05

// Tiers that are systematically demoted on the quality factor when the task
// is complex AND the user did NOT prioritise transparency/sustainability.
// These tiers are not built for hard work — even if their TF score is high
// for a task, complex tasks should bias toward flagship-tier models.
const COMPLEX_TASK_QUALITY_DEMOTION = 0.85
const DEMOTED_TIERS_FOR_COMPLEX = new Set([
  'budget',
  'sustainable_balanced',
  'enterprise_transparent',
])

// Phase 3.2: when the classifier flags a task as needing multi-step reasoning,
// boost the quality factor of models with the `extended_thinking` capability
// so reasoning-tuned models (Opus, Sonnet, DeepSeek R1, etc.) surface for
// math, strategy, legal-risk, and proof prompts. Note this can push quality
// above 1.0 — that's intentional. Quality is a score multiplied by a weight,
// not a probability, so values >1 still produce sensible orderings.
const REASONING_QUALITY_BOOST = 1.20

// Phase 4.1 (data_sensitivity): privacy factor-score multipliers. These
// multiply the privacy *score*, not the weight — values >1.0 may push privacy
// above 1.0, which is fine because scores combine multiplicatively with
// weights and a higher score correctly raises a model's overall ranking.
const PRIVACY_BOOST_REGULATED = 1.5  // regulated_health, regulated_finance
const PRIVACY_BOOST_PII = 1.2

// Phase 4.1: when on-prem is required, hard-filter to models with local_info.
// Applied BEFORE factor scores are built so filtered models never appear.

// Phase 4.2 (latency_target): realtime requires speed_score >= 0.85. Below
// that threshold the model is hard-filtered out. Batch latency targets boost
// the cost factor *score* by 1.3 (you'd expect a weight bump, but the priority
// pipeline already determines weights — boosting the score is a cleaner
// drop-in that achieves the same surfacing-cheap-models effect).
const REALTIME_SPEED_THRESHOLD = 0.85
const COST_BOOST_BATCH = 1.3

// Phase 4.3 (volume): cost-factor-score amplification by volume tier. Same
// score-multiplier (not weight) approach as latency batch above.
const COST_BOOST_THOUSANDS = 1.3
const COST_BOOST_MILLIONS = 1.6

// Volume × latency interaction: when both apply, take max() rather than
// multiplying. Volume is the dominant signal and stacking multiplicatively
// would runaway-boost cheap models on batch + high-volume tasks; max() keeps
// the boost capped at the strongest applicable signal.

// Phase 4.4 (needs_long_context): hard-filter to models with a context window
// >= 100k tokens. Inputs that genuinely don't fit will silently truncate on
// smaller models, which is worse than excluding them.
const LONG_CONTEXT_THRESHOLD = 100_000

// Phase 4.5a (needs_multilingual): boost quality on models that explicitly
// list the `multilingual` capability. Stacks intentionally with the reasoning
// boost — the two signals are orthogonal (a multilingual reasoning task
// genuinely wants both qualities).
const MULTILINGUAL_QUALITY_BOOST = 1.10

// Phase 4.5b (is_agentic): boost quality on models that have BOTH `tools` and
// `extended_thinking`. Agentic workloads need to plan multi-step tool calls
// (extended_thinking) and execute them (tools); a model with only one of the
// two isn't a good agent host. Stacks with the other quality boosts.
const AGENTIC_QUALITY_BOOST = 1.15

export function costScore(
  model: Model,
  allModels: Model[],
  inputLength: string,
  costWeightHint = 0.18,
  outputLength: string = 'medium',
): number {
  const costs = allModels.map(m => estimateCost(m, inputLength, outputLength))
  const minCost = Math.min(...costs)
  const maxCost = Math.max(...costs)
  if (maxCost === minCost) return 1.0
  const modelCost = estimateCost(model, inputLength, outputLength)
  const logMin = Math.log(minCost + 0.0001)
  const logMax = Math.log(maxCost + 0.0001)
  const logModel = Math.log(modelCost + 0.0001)
  const baseScore = Math.max(COST_SCORE_FLOOR, 1.0 - (logModel - logMin) / (logMax - logMin))

  // Compress towards 0.5 when cost is low priority. At costWeightHint >= 0.30
  // no compression; at 0 max compression (0.85 strength — Phase 2.4 raised
  // from 0.6 to better honour low cost priority and let flagship quality
  // leads close the cost gap).
  const compression = Math.max(0, 1 - costWeightHint / 0.30)
  return baseScore + (0.5 - baseScore) * compression * 0.85
}

function getBenchmarkBlend(): number {
  const raw = process.env.BENCHMARK_BLEND
  if (!raw) return 0
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(1, Math.max(0, parsed))
}

// When curated and benchmark disagree by more than this, skip the blend and
// use curated only. Phase 1.4 inspection found 43/134 pairs (32%) with
// |delta| > 0.10 — driven by specialist models the LMArena cohort doesn't
// cover (devstral, mistral-ocr) and budget models that LMArena over-rates
// versus our task-specific rubric. Blending these pairs imports noise; the
// blend works well for the well-aligned majority below the threshold.
export const BENCHMARK_DELTA_SKIP_THRESHOLD = 0.10

function qualityScore(
  model: Model,
  taskType: string,
  benchmarkScores: Map<string, number> | undefined,
  blend: number,
): number {
  const curated = model.task_fitness[taskType]
  if (curated === undefined) {
    // Post-v0.8 every registry row carries all twelve canonical keys, so a
    // miss either means the classifier returned a value outside the enum
    // (bug upstream) or the registry row is stale. Warn and fall back to
    // 0.5 so we don't silently bias rankings — but make the gap visible.
    if ((ALL_TASK_TYPES as readonly string[]).includes(taskType)) {
      console.warn(
        `[scoring] model ${model.slug} is missing task_fitness key "${taskType}" — registry row may be stale; falling back to 0.5`,
      )
    } else {
      console.warn(
        `[scoring] received unknown taskType "${taskType}" not in ALL_TASK_TYPES — classifier output drift; falling back to 0.5`,
      )
    }
    return 0.5
  }
  if (blend <= 0 || !benchmarkScores) return curated
  const benchmark = benchmarkScores.get(`${model.slug}::${taskType}`)
  if (benchmark === undefined) return curated
  if (Math.abs(curated - benchmark) > BENCHMARK_DELTA_SKIP_THRESHOLD) return curated
  return curated * (1 - blend) + benchmark * blend
}

function capabilityScore(model: Model, needs: { vision: boolean; tools: boolean; code: boolean }): number | null {
  if (needs.vision && !model.capabilities.includes('vision')) return null
  if (needs.tools && !model.capabilities.includes('tools')) return null
  if (needs.code && !model.capabilities.includes('code')) return null
  const allCaps = ['vision', 'tools', 'code', 'long_context', 'extended_thinking', 'structured_output', 'multilingual', 'audio', 'video']
  const modelCaps = model.capabilities.filter(c => allCaps.includes(c))
  return modelCaps.length / allCaps.length
}

// Phase 5.1: hard filters live in one place so they're testable in isolation
// and exclusion reasons can be surfaced in the UI ("5 models excluded because
// they require cloud hosting"). Order matches scoreModels' historical order:
// long_context first, then on-prem, then realtime, then capability gates.
export type HardFilterReason =
  | 'long_context'
  | 'on_prem_required'
  | 'realtime'
  | 'missing_vision'
  | 'missing_tools'
  | 'missing_code'
  // v0.9: routes embedding tasks to model_class='embedding' models only,
  // and all other tasks to model_class='chat' models only. Embedding
  // models have task_fitness scores that don't compare meaningfully to
  // chat models on generative tasks (and vice versa) — the two are
  // disjoint workloads, so a hard class filter beats trying to blend.
  | 'wrong_class'

export interface HardFilterResult {
  ok: boolean
  reason?: HardFilterReason
}

export function hardFilter(model: Model, input: ScoringInput): HardFilterResult {
  // Class routing runs first so the rest of the filter chain doesn't have to
  // reason about cross-class comparisons. An `embedding` task wants a vector
  // model; anything else wants a chat model.
  const wantsEmbedding = input.taskType === 'embedding'
  if (wantsEmbedding && model.model_class !== 'embedding') {
    return { ok: false, reason: 'wrong_class' }
  }
  if (!wantsEmbedding && model.model_class === 'embedding') {
    return { ok: false, reason: 'wrong_class' }
  }
  if (input.needsLongContext && model.context_window < LONG_CONTEXT_THRESHOLD) {
    return { ok: false, reason: 'long_context' }
  }
  if (input.dataSensitivity === 'on_prem_required' && !model.local_info) {
    return { ok: false, reason: 'on_prem_required' }
  }
  if (input.latencyTarget === 'realtime' && model.speed_score < REALTIME_SPEED_THRESHOLD) {
    return { ok: false, reason: 'realtime' }
  }
  if (input.needsVision && !model.capabilities.includes('vision')) {
    return { ok: false, reason: 'missing_vision' }
  }
  if (input.needsTools && !model.capabilities.includes('tools')) {
    return { ok: false, reason: 'missing_tools' }
  }
  if (input.needsCode && !model.capabilities.includes('code')) {
    return { ok: false, reason: 'missing_code' }
  }
  return { ok: true }
}

export interface Exclusion {
  slug: string
  name: string
  reason: HardFilterReason
}

export interface ScoringResult {
  models: ScoredModel[]
  excluded: Exclusion[]
}

export function scoreModels(input: ScoringInput): ScoredModel[] {
  return scoreModelsDetailed(input).models
}

export function scoreModelsDetailed(input: ScoringInput): ScoringResult {
  const models = getAllModels()
  const weights = priorityToWeights(input.priorityOrder, {
    complexity: input.complexity,
    excludedFactors: input.excludedFactors,
  })
  const blend = getBenchmarkBlend()
  const scored: ScoredModel[] = []
  const excluded: Exclusion[] = []

  // Stacking order for the per-model loop below (top to bottom):
  //   1. Hard filters (long-context, on-prem, realtime, capability) — `continue` if any fail.
  //   2. Build raw factorScores (cost, speed, quality, privacy, sustainability, transparency, capability).
  //   3. Tier-floor demotion (Phase 3.1): quality × 0.85 for budget tiers on complex tasks.
  //   4. Reasoning multiplier (Phase 3.2): quality × 1.20 if extended_thinking + needs_reasoning.
  //   5. Multilingual multiplier (Phase 4.5a): quality × 1.10 if multilingual capability + flag.
  //   6. Agentic multiplier (Phase 4.5b): quality × 1.15 if tools + extended_thinking + flag.
  //   7. Privacy multiplier (Phase 4.1): privacy × 1.5 / 1.2 by data_sensitivity tier.
  //   8. Cost multiplier (Phase 4.2/4.3): cost × max(latency_batch, volume_high_tier).
  // Multipliers stack multiplicatively; max() guards only the cost-boost interaction.
  const outputLength = input.outputLength ?? 'medium'

  for (const model of models) {
    // Phase 5.1: all hard filters run through hardFilter() so the rejection
    // reason is captured for UI surfacing.
    const filter = hardFilter(model, input)
    if (!filter.ok) {
      excluded.push({ slug: model.slug, name: model.name, reason: filter.reason! })
      continue
    }

    const capScore = capabilityScore(model, {
      vision: input.needsVision,
      tools: input.needsTools,
      code: input.needsCode,
    })!
    // capScore can no longer be null — hardFilter has already rejected the
    // missing-capability cases above.

    const factorScores: Record<Factor, number> = {
      cost: costScore(model, models, input.inputLength, weights.cost, outputLength),
      speed: model.speed_score,
      quality: qualityScore(model, input.taskType, input.benchmarkScores, blend),
      privacy: model.privacy_score,
      sustainability: model.sustainability.sustainability_score,
      transparency: model.transparency.transparency_score,
      capability: capScore,
    }

    // Phase 3.1: demote quality on tiers that aren't built for hard work when
    // the task is complex — unless the user explicitly elevated transparency
    // or sustainability into their top 3 priorities (their editorial choice
    // wins over the systematic demotion).
    const userPrioritisesEthics =
      input.priorityOrder.slice(0, 3).includes('transparency') ||
      input.priorityOrder.slice(0, 3).includes('sustainability')

    if (
      input.complexity === 'complex' &&
      DEMOTED_TIERS_FOR_COMPLEX.has(model.tier) &&
      !userPrioritisesEthics
    ) {
      factorScores.quality *= COMPLEX_TASK_QUALITY_DEMOTION
    }

    // Phase 3.2: reasoning multiplier. May push quality > 1.0 (see constant).
    if (input.needsReasoning && model.capabilities.includes('extended_thinking')) {
      factorScores.quality *= REASONING_QUALITY_BOOST
    }

    // Phase 4.5a: multilingual multiplier. Stacks with reasoning intentionally
    // — multilingual reasoning is a real-world workload (e.g. translate then
    // analyse) and we want to surface models that excel at both.
    if (input.needsMultilingual && model.capabilities.includes('multilingual')) {
      factorScores.quality *= MULTILINGUAL_QUALITY_BOOST
    }

    // Phase 4.5b: agentic multiplier. Requires BOTH tools AND extended_thinking
    // — agents need planning + execution. Stacks with the other quality boosts.
    if (
      input.isAgentic &&
      model.capabilities.includes('tools') &&
      model.capabilities.includes('extended_thinking')
    ) {
      factorScores.quality *= AGENTIC_QUALITY_BOOST
    }

    // Phase 4.1: privacy boost for sensitive data. Score multiplier (not
    // weight) — see note on PRIVACY_BOOST_REGULATED.
    if (input.dataSensitivity === 'regulated_health' || input.dataSensitivity === 'regulated_finance') {
      factorScores.privacy *= PRIVACY_BOOST_REGULATED
    } else if (input.dataSensitivity === 'pii') {
      factorScores.privacy *= PRIVACY_BOOST_PII
    }

    // Phase 4.2 + 4.3: cost-factor-score boost. Volume is the dominant signal,
    // so we take max() of the two boosts rather than multiplying — see note
    // on COST_BOOST_MILLIONS for the rationale.
    let costBoost = 1.0
    if (input.latencyTarget === 'batch') costBoost = Math.max(costBoost, COST_BOOST_BATCH)
    if (input.volume === 'thousands_per_day') costBoost = Math.max(costBoost, COST_BOOST_THOUSANDS)
    if (input.volume === 'millions_per_day') costBoost = Math.max(costBoost, COST_BOOST_MILLIONS)
    if (costBoost !== 1.0) factorScores.cost *= costBoost

    const weightedScore = Object.entries(factorScores).reduce(
      (sum, [factor, score]) => sum + score * weights[factor as Factor], 0
    )

    scored.push({
      slug: model.slug,
      name: model.name,
      provider: model.provider,
      tier: model.tier,
      weightedScore,
      factorScores,
      estimatedCost: estimateCost(model, input.inputLength, outputLength),
      capabilities: model.capabilities,
      strengths: model.strengths,
      weaknesses: model.weaknesses,
      contextWindow: model.context_window,
    })
  }

  return {
    models: scored.sort((a, b) => b.weightedScore - a.weightedScore),
    excluded,
  }
}
