import type { GoldenTaskEvaluation } from './golden-evaluation'
import type { ShadowImpact } from './shadow-ranking'

export interface RankingBaselineEntry {
  id: string
  /** Approved top five only; lower-rank churn is not a release gate. */
  ranking: string[]
  eligibleCount: number
}

export interface RankingBaseline {
  version: 1
  note: string
  tasks: RankingBaselineEntry[]
}

export interface BaselineDrift {
  id: string
  approvedTop: string | null
  currentTop: string | null
  topChanged: boolean
  top3Overlap: number
  maxApprovedTop5RankShift: number
  eligibleCountDelta: number
  impact: ShadowImpact
}

export interface BaselineDriftReport {
  taskCount: number
  changedTopCount: number
  highImpactCount: number
  mediumImpactCount: number
  lowImpactCount: number
  unchangedCount: number
  changes: BaselineDrift[]
}

export function baselineFromEvaluations(evaluations: GoldenTaskEvaluation[]): RankingBaseline {
  return {
    version: 1,
    note: 'Approved golden-task top-five baseline. Update only after reviewing shadow-ranking changes.',
    tasks: evaluations.map((evaluation) => ({
      id: evaluation.id,
      ranking: evaluation.models.slice(0, 5).map((model) => model.slug),
      eligibleCount: evaluation.eligibleCount,
    })),
  }
}

function rankOf(slug: string, ranking: string[]): number | null {
  const index = ranking.indexOf(slug)
  return index === -1 ? null : index + 1
}

function classifyImpact(input: Omit<BaselineDrift, 'impact'>): ShadowImpact {
  if (
    (input.topChanged && input.top3Overlap <= 1) ||
    input.maxApprovedTop5RankShift >= 4 ||
    Math.abs(input.eligibleCountDelta) >= 4
  ) return 'high'

  if (
    input.topChanged ||
    input.top3Overlap < 3 ||
    input.maxApprovedTop5RankShift >= 2 ||
    Math.abs(input.eligibleCountDelta) >= 2
  ) return 'medium'

  if (input.maxApprovedTop5RankShift > 0 || input.eligibleCountDelta !== 0) return 'low'
  return 'none'
}

/**
 * Compare the current production scorer with the last explicitly approved
 * top-five snapshot. This catches meaningful recommendation drift while
 * ignoring harmless reorderings deep in the model catalogue.
 */
export function compareApprovedBaseline(
  approved: RankingBaseline,
  current: RankingBaseline,
): BaselineDriftReport {
  const currentById = new Map(current.tasks.map((entry) => [entry.id, entry]))
  const changes: BaselineDrift[] = approved.tasks.map((base) => {
    const next = currentById.get(base.id)
    if (!next) {
      return {
        id: base.id,
        approvedTop: base.ranking[0] ?? null,
        currentTop: null,
        topChanged: true,
        top3Overlap: 0,
        maxApprovedTop5RankShift: base.ranking.length,
        eligibleCountDelta: -base.eligibleCount,
        impact: 'high' as const,
      }
    }

    const nextTop3 = new Set(next.ranking.slice(0, 3))
    const top3Overlap = base.ranking.slice(0, 3).filter((slug) => nextTop3.has(slug)).length
    const maxApprovedTop5RankShift = base.ranking.slice(0, 5).reduce((maxShift, slug, index) => {
      const nextRank = rankOf(slug, next.ranking)
      // Leaving the approved top five counts as one position beyond the
      // snapshot boundary; we care that it dropped out, not its exact #17 rank.
      const shift = nextRank == null ? Math.abs(6 - (index + 1)) : Math.abs(nextRank - (index + 1))
      return Math.max(maxShift, shift)
    }, 0)

    const raw: Omit<BaselineDrift, 'impact'> = {
      id: base.id,
      approvedTop: base.ranking[0] ?? null,
      currentTop: next.ranking[0] ?? null,
      topChanged: (base.ranking[0] ?? null) !== (next.ranking[0] ?? null),
      top3Overlap,
      maxApprovedTop5RankShift,
      eligibleCountDelta: next.eligibleCount - base.eligibleCount,
    }
    return { ...raw, impact: classifyImpact(raw) }
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
