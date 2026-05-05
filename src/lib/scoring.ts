import { getAllModels, type Factor, type Model } from './registry'
import { priorityToWeights } from './weights'

export interface ScoringInput {
  taskType: string
  complexity: string
  inputLength: string
  needsVision: boolean
  needsTools: boolean
  needsCode: boolean
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

const TOKEN_ESTIMATES: Record<string, { input: number; output: number }> = {
  short: { input: 500, output: 250 },
  medium: { input: 2000, output: 1000 },
  long: { input: 8000, output: 2000 },
  very_long: { input: 32000, output: 4000 },
}

function estimateCost(model: Model, inputLength: string): number {
  const tokens = TOKEN_ESTIMATES[inputLength] ?? TOKEN_ESTIMATES.medium
  const inputCost = (tokens.input / 1_000_000) * model.pricing.input_per_1m
  const outputCost = (tokens.output / 1_000_000) * model.pricing.output_per_1m
  return inputCost + outputCost
}

// Log-scale cost scoring with floor — prevents the most expensive model
// from scoring a flat zero, which would make it unrecommendable even when
// cost is the user's lowest priority.
const COST_SCORE_FLOOR = 0.05

export function costScore(
  model: Model,
  allModels: Model[],
  inputLength: string,
  costWeightHint = 0.18,
): number {
  const costs = allModels.map(m => estimateCost(m, inputLength))
  const minCost = Math.min(...costs)
  const maxCost = Math.max(...costs)
  if (maxCost === minCost) return 1.0
  const modelCost = estimateCost(model, inputLength)
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
  const curated = model.task_fitness[taskType] ?? 0.5
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

export function scoreModels(input: ScoringInput): ScoredModel[] {
  const models = getAllModels()
  const weights = priorityToWeights(input.priorityOrder, {
    complexity: input.complexity,
    excludedFactors: input.excludedFactors,
  })
  const blend = getBenchmarkBlend()
  const scored: ScoredModel[] = []

  for (const model of models) {
    const capScore = capabilityScore(model, {
      vision: input.needsVision,
      tools: input.needsTools,
      code: input.needsCode,
    })
    if (capScore === null) continue

    const factorScores: Record<Factor, number> = {
      cost: costScore(model, models, input.inputLength, weights.cost),
      speed: model.speed_score,
      quality: qualityScore(model, input.taskType, input.benchmarkScores, blend),
      privacy: model.privacy_score,
      sustainability: model.sustainability.sustainability_score,
      transparency: model.transparency.transparency_score,
      capability: capScore,
    }

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
      estimatedCost: estimateCost(model, input.inputLength),
      capabilities: model.capabilities,
      strengths: model.strengths,
      weaknesses: model.weaknesses,
      contextWindow: model.context_window,
    })
  }

  return scored.sort((a, b) => b.weightedScore - a.weightedScore)
}
