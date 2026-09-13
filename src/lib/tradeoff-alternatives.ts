import type { Factor } from './registry'
import type { ScoredModel } from './scoring'

export type TradeoffKey =
  | 'cost'
  | 'speed'
  | 'local'
  | 'privacy'
  | 'transparency'
  | 'sustainability'
  | 'quality'
  | 'close'

export interface FeaturedAlternative {
  slug: string
  originalRank: number
  key: TradeoffKey
  label: string
  reason: string
}

export interface TradeoffAlternativeOptions {
  limit?: number
  isLocal?: (slug: string) => boolean
}

interface Advantage {
  key: Exclude<TradeoffKey, 'close'>
  strength: number
  label: string
  reason: string
}

const FACTOR_ADVANTAGES: Array<{
  factor: Factor
  key: Exclude<TradeoffKey, 'cost' | 'local' | 'close'>
  threshold: number
  scale: number
  label: string
  reason: string
}> = [
  {
    factor: 'speed', key: 'speed', threshold: 0.08, scale: 0.25,
    label: 'Faster option', reason: 'Stronger speed profile than the best fit, with a different overall trade-off.',
  },
  {
    factor: 'privacy', key: 'privacy', threshold: 0.08, scale: 0.25,
    label: 'More private', reason: 'Stronger privacy profile than the best fit, while remaining a credible recommendation.',
  },
  {
    factor: 'transparency', key: 'transparency', threshold: 0.10, scale: 0.30,
    label: 'More transparent', reason: 'Stronger transparency profile than the best fit, with the trade-off reflected elsewhere in the ranking.',
  },
  {
    factor: 'sustainability', key: 'sustainability', threshold: 0.10, scale: 0.30,
    label: 'Lower-impact option', reason: 'Stronger sustainability profile than the best fit, while staying close enough to be a practical alternative.',
  },
  {
    factor: 'quality', key: 'quality', threshold: 0.05, scale: 0.20,
    label: 'Quality-led option', reason: 'Scores higher on task quality than the best fit, but gives up ground on other priorities.',
  },
]

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function factorScore(model: ScoredModel, factor: Factor): number {
  return model.factorScores[factor] ?? 0
}

function advantages(
  primary: ScoredModel,
  candidate: ScoredModel,
  isLocal?: (slug: string) => boolean,
): Advantage[] {
  const result: Advantage[] = []

  const saving = primary.estimatedCost > 0
    ? 1 - candidate.estimatedCost / primary.estimatedCost
    : 0
  if (saving >= 0.25) {
    const percent = Math.round(saving * 100)
    result.push({
      key: 'cost',
      strength: clamp01(saving / 0.65),
      label: 'Cheaper option',
      reason: `About ${percent}% cheaper per estimated task than the best fit, while remaining a credible route.`,
    })
  }

  if (isLocal && isLocal(candidate.slug) && !isLocal(primary.slug)) {
    result.push({
      key: 'local',
      strength: 1,
      label: 'Local option',
      reason: 'Can run locally, unlike the hosted best fit, if keeping work on your own infrastructure matters more.',
    })
  }

  for (const definition of FACTOR_ADVANTAGES) {
    const delta = factorScore(candidate, definition.factor) - factorScore(primary, definition.factor)
    if (delta < definition.threshold) continue
    result.push({
      key: definition.key,
      strength: clamp01(delta / definition.scale),
      label: definition.label,
      reason: definition.reason,
    })
  }

  return result
}

/**
 * Pick alternatives that explain a real choice rather than mechanically showing
 * ranks #2 and #3. Candidates must stay reasonably close to the best fit, then
 * earn a featured slot by offering a material advantage on another dimension.
 *
 * The ranking itself is untouched. `originalRank` always points back to the
 * production recommendation order so selection/outcome data remains truthful.
 */
export function selectTradeoffAlternatives(
  models: ScoredModel[],
  options: TradeoffAlternativeOptions = {},
): FeaturedAlternative[] {
  const primary = models[0]
  if (!primary) return []

  const limit = Math.max(0, options.limit ?? 2)
  if (limit === 0) return []

  const candidates = models
    .slice(1, 12)
    .map((model, index) => {
      const originalRank = index + 2
      const relativeFit = primary.weightedScore > 0
        ? model.weightedScore / primary.weightedScore
        : 1
      if (relativeFit < 0.78) return null

      const modelAdvantages = advantages(primary, model, options.isLocal)
      if (modelAdvantages.length === 0) return null
      const bestAdvantage = [...modelAdvantages].sort((a, b) => b.strength - a.strength)[0]

      // Relevance still matters: a dramatic trade-off should not promote a
      // plainly weak model. Rank is a small tie-breaker rather than the reason
      // a model is selected.
      const relevance = clamp01(relativeFit)
      const rankPenalty = Math.min(0.12, (originalRank - 2) * 0.015)
      const score = relevance * 0.58 + bestAdvantage.strength * 0.42 - rankPenalty

      return {
        model,
        originalRank,
        score,
        advantages: modelAdvantages,
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)

  // First take the strongest candidate for each kind of trade-off. This stops
  // the default surface from showing two near-identical "cheaper" options.
  const bestByKey = new Map<Advantage['key'], {
    model: ScoredModel
    originalRank: number
    score: number
    advantage: Advantage
  }>()

  for (const candidate of candidates) {
    for (const advantage of candidate.advantages) {
      const entry = {
        model: candidate.model,
        originalRank: candidate.originalRank,
        score: candidate.score + advantage.strength * 0.08,
        advantage,
      }
      const current = bestByKey.get(advantage.key)
      if (!current || entry.score > current.score) bestByKey.set(advantage.key, entry)
    }
  }

  const selected: FeaturedAlternative[] = []
  const usedSlugs = new Set<string>()
  for (const entry of [...bestByKey.values()].sort((a, b) => b.score - a.score)) {
    if (usedSlugs.has(entry.model.slug)) continue
    selected.push({
      slug: entry.model.slug,
      originalRank: entry.originalRank,
      key: entry.advantage.key,
      label: entry.advantage.label,
      reason: entry.advantage.reason,
    })
    usedSlugs.add(entry.model.slug)
    if (selected.length >= limit) break
  }

  // Very homogeneous rankings can genuinely lack two material trade-offs. Keep
  // the UI useful with the next strongest unused option, but label it honestly
  // as a close alternative rather than manufacturing a distinction.
  for (let index = 1; selected.length < limit && index < models.length; index++) {
    const model = models[index]
    if (usedSlugs.has(model.slug)) continue
    selected.push({
      slug: model.slug,
      originalRank: index + 1,
      key: 'close',
      label: 'Close alternative',
      reason: 'One of the next-strongest overall recommendations; Bearing did not find a clearer material trade-off to feature here.',
    })
    usedSlugs.add(model.slug)
  }

  return selected
}
