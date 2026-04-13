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

function costScore(model: Model, allModels: Model[], inputLength: string): number {
  const costs = allModels.map(m => estimateCost(m, inputLength))
  const minCost = Math.min(...costs)
  const maxCost = Math.max(...costs)
  if (maxCost === minCost) return 1.0
  const modelCost = estimateCost(model, inputLength)
  const logMin = Math.log(minCost + 0.0001)
  const logMax = Math.log(maxCost + 0.0001)
  const logModel = Math.log(modelCost + 0.0001)
  return Math.max(COST_SCORE_FLOOR, 1.0 - (logModel - logMin) / (logMax - logMin))
}

function qualityScore(model: Model, taskType: string): number {
  return model.task_fitness[taskType] ?? 0.5
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
  const weights = priorityToWeights(input.priorityOrder)
  const scored: ScoredModel[] = []

  for (const model of models) {
    const capScore = capabilityScore(model, {
      vision: input.needsVision,
      tools: input.needsTools,
      code: input.needsCode,
    })
    if (capScore === null) continue

    const factorScores: Record<Factor, number> = {
      cost: costScore(model, models, input.inputLength),
      speed: model.speed_score,
      quality: qualityScore(model, input.taskType),
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
