import type { ScoredModel } from './scoring'

export interface InformationRouteOptions {
  /** Total models in the route, including the anchor. */
  k: number
  /** Optional user-selected anchor. Falls back to the top runnable model. */
  anchorSlug?: string | null
  /** Whether Bearing can execute this model now. */
  runnable: (slug: string) => boolean
  /** Optional local/deployable signal for hosted-vs-local experiments. */
  isLocal?: (slug: string) => boolean
}

export interface InformationRouteCandidate {
  model: ScoredModel
  /** Rank in the recommendation list, not position in the experiment. */
  recommendationRank: number
  /** Human-readable reason this model was included. */
  selectionReason: string
  /** Relative information value used to choose challengers. */
  informationScore: number
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function relativeDifference(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(a), 0.01)
}

function factorDistance(a: ScoredModel, b: ScoredModel): number {
  const factors = Object.keys(a.factorScores)
  if (factors.length === 0) return 0

  const mean = factors.reduce((sum, factor) => {
    const av = a.factorScores[factor as keyof typeof a.factorScores] ?? 0
    const bv = b.factorScores[factor as keyof typeof b.factorScores] ?? 0
    return sum + Math.min(1, Math.abs(av - bv))
  }, 0) / factors.length

  return clamp01(mean / 0.35)
}

function costContrast(anchor: ScoredModel, candidate: ScoredModel): number {
  const higher = Math.max(anchor.estimatedCost, candidate.estimatedCost, 0.000001)
  const lower = Math.min(anchor.estimatedCost, candidate.estimatedCost)
  return clamp01(1 - lower / higher)
}

function describeSelection(
  anchor: ScoredModel,
  candidate: ScoredModel,
  recommendationRank: number,
  isLocal?: (slug: string) => boolean,
): string {
  const reasons: string[] = []
  const scoreGap = relativeDifference(anchor.weightedScore, candidate.weightedScore)

  if (scoreGap <= 0.05) reasons.push('close score')
  else if (scoreGap <= 0.12) reasons.push('credible alternative')

  if (candidate.provider !== anchor.provider) reasons.push('different provider')

  if (candidate.estimatedCost <= anchor.estimatedCost * 0.7) {
    const saving = Math.round((1 - candidate.estimatedCost / Math.max(anchor.estimatedCost, 0.000001)) * 100)
    reasons.push(`${saving}% cheaper`)
  } else if (candidate.estimatedCost >= anchor.estimatedCost * 1.5) {
    reasons.push('tests a higher-cost option')
  }

  if (isLocal) {
    const anchorLocal = isLocal(anchor.slug)
    const candidateLocal = isLocal(candidate.slug)
    if (anchorLocal !== candidateLocal) {
      reasons.push(candidateLocal ? 'tests a local option' : 'tests a hosted option')
    }
  }

  if (factorDistance(anchor, candidate) >= 0.45) reasons.push('different trade-off profile')

  if (reasons.length === 0) reasons.push(`strong alternative at recommendation #${recommendationRank}`)
  return reasons.join(' · ')
}

function informationValue(
  anchor: ScoredModel,
  candidate: ScoredModel,
  alreadySelected: ScoredModel[],
  recommendationRank: number,
  isLocal?: (slug: string) => boolean,
): number {
  const scoreGap = relativeDifference(anchor.weightedScore, candidate.weightedScore)
  const closeness = clamp01(1 - scoreGap / 0.20)
  const providerDiversity = candidate.provider !== anchor.provider ? 1 : 0
  const factorContrast = factorDistance(anchor, candidate)
  const costDifference = costContrast(anchor, candidate)

  const localContrast = isLocal && isLocal(anchor.slug) !== isLocal(candidate.slug) ? 1 : 0
  const providerNovelty = alreadySelected.length > 0 && alreadySelected.every((m) => m.provider !== candidate.provider)
    ? 1
    : 0

  // Preserve relevance: experimentation should stay near the top of the
  // recommendation set unless a candidate offers a genuinely useful contrast.
  const rankPenalty = clamp01((recommendationRank - 1) / 12) * 0.12

  return (
    closeness * 0.44 +
    providerDiversity * 0.18 +
    costDifference * 0.13 +
    factorContrast * 0.13 +
    localContrast * 0.07 +
    providerNovelty * 0.05 -
    rankPenalty
  )
}

/**
 * Choose an anchor plus challengers that are useful for learning, rather than
 * mechanically taking the next N models by rank.
 *
 * The first model is the user-selected anchor (or top runnable recommendation).
 * Subsequent candidates are chosen greedily for information value: stay close
 * to the recommendation, but prefer provider, cost, factor-profile and
 * local-vs-hosted contrasts that can teach Bearing something useful.
 */
export function pickInformationRoute(
  scored: ScoredModel[],
  options: InformationRouteOptions,
): InformationRouteCandidate[] {
  if (options.k <= 0) return []

  const runnable = scored
    .map((model, index) => ({ model, recommendationRank: index + 1 }))
    .filter(({ model }) => options.runnable(model.slug))

  if (runnable.length === 0) return []

  const anchorEntry = options.anchorSlug
    ? runnable.find(({ model }) => model.slug === options.anchorSlug)
    : runnable[0]
  if (!anchorEntry) return []

  const selected: InformationRouteCandidate[] = [{
    ...anchorEntry,
    informationScore: 1,
    selectionReason: options.anchorSlug ? 'Selected model' : "Bearing's recommendation",
  }]

  while (selected.length < options.k) {
    const selectedModels = selected.map((entry) => entry.model)
    const remaining = runnable.filter(({ model }) => !selectedModels.some((chosen) => chosen.slug === model.slug))
    if (remaining.length === 0) break

    const rankedByInformation = remaining
      .map((entry) => ({
        ...entry,
        informationScore: informationValue(
          anchorEntry.model,
          entry.model,
          selectedModels.slice(1),
          entry.recommendationRank,
          options.isLocal,
        ),
      }))
      .sort((a, b) => b.informationScore - a.informationScore)

    const best = rankedByInformation[0]
    selected.push({
      ...best,
      selectionReason: describeSelection(
        anchorEntry.model,
        best.model,
        best.recommendationRank,
        options.isLocal,
      ),
    })
  }

  return selected
}
