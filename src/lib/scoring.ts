import { ALL_TASK_TYPES, getAllModels, type Factor, type Model } from './registry'
import { priorityToWeights } from './weights'
import { taskRelativeCapabilityScore } from './capability-fit'

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

const COST_SCORE_FLOOR = 0.05

const COMPLEX_TASK_QUALITY_DEMOTION = 0.85
const DEMOTED_TIERS_FOR_COMPLEX = new Set([
  'budget',
  'sustainable_balanced',
  'enterprise_transparent',
])

const REASONING_QUALITY_BOOST = 1.20
const PRIVACY_BOOST_REGULATED = 1.5
const PRIVACY_BOOST_PII = 1.2
const REALTIME_SPEED_THRESHOLD = 0.85
const COST_BOOST_BATCH = 1.3
const COST_BOOST_THOUSANDS = 1.3
const COST_BOOST_MILLIONS = 1.6
const LONG_CONTEXT_THRESHOLD = 100_000
const MULTILINGUAL_QUALITY_BOOST = 1.10
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

export const BENCHMARK_DELTA_SKIP_THRESHOLD = 0.10

function qualityScore(
  model: Model,
  taskType: string,
  benchmarkScores: Map<string, number> | undefined,
  blend: number,
): number {
  const curated = model.task_fitness[taskType]
  if (curated === undefined) {
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

function capabilityScore(model: Model, input: ScoringInput): number {
  return taskRelativeCapabilityScore(model, {
    complexity: input.complexity,
    inputLength: input.inputLength,
    needsVision: input.needsVision,
    needsTools: input.needsTools,
    needsCode: input.needsCode,
    needsReasoning: input.needsReasoning,
    needsMultilingual: input.needsMultilingual,
    isAgentic: input.isAgentic,
  })
}

export type HardFilterReason =
  | 'long_context'
  | 'on_prem_required'
  | 'realtime'
  | 'missing_vision'
  | 'missing_tools'
  | 'missing_code'
  | 'wrong_class'

export interface HardFilterResult {
  ok: boolean
  reason?: HardFilterReason
}

export function hardFilter(model: Model, input: ScoringInput): HardFilterResult {
  const wantsEmbedding = input.taskType === 'embedding'
  if (wantsEmbedding && model.model_class !== 'embedding') {
    return { ok: false, reason: 'wrong_class' }
  }
  if (!wantsEmbedding && model.model_class === 'embedding') {
    return { ok: false, reason: 'wrong_class' }
  }
  if (!wantsEmbedding && input.needsLongContext && model.context_window < LONG_CONTEXT_THRESHOLD) {
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
  const outputLength = input.outputLength ?? 'medium'

  for (const model of models) {
    const filter = hardFilter(model, input)
    if (!filter.ok) {
      excluded.push({ slug: model.slug, name: model.name, reason: filter.reason! })
      continue
    }

    const capScore = capabilityScore(model, input)

    const factorScores: Record<Factor, number> = {
      cost: costScore(model, models, input.inputLength, weights.cost, outputLength),
      speed: model.speed_score,
      quality: qualityScore(model, input.taskType, input.benchmarkScores, blend),
      privacy: model.privacy_score,
      sustainability: model.sustainability.sustainability_score,
      transparency: model.transparency.transparency_score,
      capability: capScore,
    }

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

    if (input.needsReasoning && model.capabilities.includes('extended_thinking')) {
      factorScores.quality *= REASONING_QUALITY_BOOST
    }

    if (input.needsMultilingual && model.capabilities.includes('multilingual')) {
      factorScores.quality *= MULTILINGUAL_QUALITY_BOOST
    }

    if (
      input.isAgentic &&
      model.capabilities.includes('tools') &&
      model.capabilities.includes('extended_thinking')
    ) {
      factorScores.quality *= AGENTIC_QUALITY_BOOST
    }

    if (input.dataSensitivity === 'regulated_health' || input.dataSensitivity === 'regulated_finance') {
      factorScores.privacy *= PRIVACY_BOOST_REGULATED
    } else if (input.dataSensitivity === 'pii') {
      factorScores.privacy *= PRIVACY_BOOST_PII
    }

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
