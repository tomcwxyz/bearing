import type { GoldenTaskEvaluation } from './golden-evaluation'

export type ShadowImpact = 'none' | 'low' | 'medium' | 'high'

export interface ShadowTaskChange {
  id: string
  baselineTop: string | null
  candidateTop: string | null
  topChanged: boolean
  baselineTop3: string[]
  candidateTop3: string[]
  top3Overlap: number
  maxBaselineTop5RankShift: number
  eligibleCountDelta: number
  impact: ShadowImpact
}

export interface ShadowRankingReport {
  taskCount: number
  changedTopCount: number
  highImpactCount: number
  mediumImpactCount: number
  lowImpactCount: number
  unchangedCount: number
  changes: ShadowTaskChange[]
}

function rankOf(slug: string, models: GoldenTaskEvaluation['models']): number | null {
  const index = models.findIndex((model) => model.slug === slug)
  return index === -1 ? null : index + 1
}

function impactFor(change: Omit<ShadowTaskChange, 'impact'>): ShadowImpact {
  if (
    change.topChanged && change.top3Overlap <= 1 ||
    change.maxBaselineTop5RankShift >= 4 ||
    Math.abs(change.eligibleCountDelta) >= 4
  ) {
    return 'high'
  }

  if (
    change.topChanged ||
    change.top3Overlap < Math.min(3, change.baselineTop3.length) ||
    change.maxBaselineTop5RankShift >= 2 ||
    Math.abs(change.eligibleCountDelta) >= 2
  ) {
    return 'medium'
  }

  const rankingChanged = change.maxBaselineTop5RankShift > 0 || change.eligibleCountDelta !== 0
  return rankingChanged ? 'low' : 'none'
}

/**
 * Compare two complete golden-corpus ranking runs. The evaluator deliberately
 * distinguishes a harmless reorder from a changed recommendation and from a
 * broad eligibility shift. This is the report future scoring PRs should inspect
 * before updating an accepted baseline.
 */
export function compareShadowRankings(
  baseline: GoldenTaskEvaluation[],
  candidate: GoldenTaskEvaluation[],
): ShadowRankingReport {
  const candidateById = new Map(candidate.map((item) => [item.id, item]))
  const changes: ShadowTaskChange[] = baseline.map((base) => {
    const next = candidateById.get(base.id)
    if (!next) {
      const missing: Omit<ShadowTaskChange, 'impact'> = {
        id: base.id,
        baselineTop: base.top,
        candidateTop: null,
        topChanged: true,
        baselineTop3: base.top3,
        candidateTop3: [],
        top3Overlap: 0,
        maxBaselineTop5RankShift: base.models.length,
        eligibleCountDelta: -base.eligibleCount,
      }
      return { ...missing, impact: 'high' }
    }

    const candidateTop3Set = new Set(next.top3)
    const top3Overlap = base.top3.filter((slug) => candidateTop3Set.has(slug)).length
    const maxBaselineTop5RankShift = base.models.slice(0, 5).reduce((maxShift, model, index) => {
      const candidateRank = rankOf(model.slug, next.models)
      const shift = candidateRank == null ? next.models.length + 1 : Math.abs(candidateRank - (index + 1))
      return Math.max(maxShift, shift)
    }, 0)

    const raw: Omit<ShadowTaskChange, 'impact'> = {
      id: base.id,
      baselineTop: base.top,
      candidateTop: next.top,
      topChanged: base.top !== next.top,
      baselineTop3: base.top3,
      candidateTop3: next.top3,
      top3Overlap,
      maxBaselineTop5RankShift,
      eligibleCountDelta: next.eligibleCount - base.eligibleCount,
    }

    return { ...raw, impact: impactFor(raw) }
  })

  return {
    taskCount: changes.length,
    changedTopCount: changes.filter((change) => change.topChanged).length,
    highImpactCount: changes.filter((change) => change.impact === 'high').length,
    mediumImpactCount: changes.filter((change) => change.impact === 'medium').length,
    lowImpactCount: changes.filter((change) => change.impact === 'low').length,
    unchangedCount: changes.filter((change) => change.impact === 'none').length,
    changes,
  }
}

/** Run a synchronous scoring pass with an explicit benchmark blend. */
export function withBenchmarkBlend<T>(blend: number, run: () => T): T {
  const previous = process.env.BENCHMARK_BLEND
  process.env.BENCHMARK_BLEND = String(Math.max(0, Math.min(1, blend)))
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env.BENCHMARK_BLEND
    else process.env.BENCHMARK_BLEND = previous
  }
}
