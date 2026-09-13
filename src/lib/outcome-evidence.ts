export type OutcomeEvidenceScope = 'task_type+complexity' | 'task_type'
export type OutcomeEvidenceLevel = 'none' | 'early' | 'supported'

export interface OutcomeEvidenceCounts {
  humanPositive: number
  humanNegative: number
  humanTies: number
  judgePositive: number
  judgeNegative: number
}

export interface ModelOutcomeEvidence extends OutcomeEvidenceCounts {
  humanSupport: number
  humanPositiveShare: number | null
  judgeSupport: number
  judgePositiveShare: number | null
  level: OutcomeEvidenceLevel
  scope: OutcomeEvidenceScope
  label: string
  detail: string
}

export const EMPTY_OUTCOME_COUNTS: OutcomeEvidenceCounts = {
  humanPositive: 0,
  humanNegative: 0,
  humanTies: 0,
  judgePositive: 0,
  judgeNegative: 0,
}

function share(positive: number, negative: number, ties = 0): number | null {
  const support = positive + negative + ties
  if (support === 0) return null
  return (positive + ties * 0.5) / support
}

/**
 * Turn aggregate signals into evidence copy without pretending a sparse sample
 * is a calibrated model success rate.
 *
 * Human evidence combines explicit task outcomes and human preferences. Machine
 * judge picks are shown separately and never count towards the human support
 * threshold.
 */
export function summariseOutcomeEvidence(
  counts: OutcomeEvidenceCounts,
  scope: OutcomeEvidenceScope,
): ModelOutcomeEvidence {
  const humanSupport = counts.humanPositive + counts.humanNegative + counts.humanTies
  const judgeSupport = counts.judgePositive + counts.judgeNegative
  const humanPositiveShare = share(counts.humanPositive, counts.humanNegative, counts.humanTies)
  const judgePositiveShare = share(counts.judgePositive, counts.judgeNegative)

  const level: OutcomeEvidenceLevel = humanSupport === 0
    ? 'none'
    : humanSupport < 5
      ? 'early'
      : 'supported'

  const scopeLabel = scope === 'task_type+complexity'
    ? 'closely similar tasks'
    : 'the same task type'

  const parts: string[] = []
  if (humanSupport > 0 && humanPositiveShare != null) {
    parts.push(`${humanSupport} human signal${humanSupport === 1 ? '' : 's'} on ${scopeLabel}; ${Math.round(humanPositiveShare * 100)}% positive-equivalent`)
  } else {
    parts.push(`No human outcome evidence yet for ${scopeLabel}`)
  }

  if (judgeSupport > 0 && judgePositiveShare != null) {
    parts.push(`${judgeSupport} blind-judge comparison${judgeSupport === 1 ? '' : 's'}; ${Math.round(judgePositiveShare * 100)}% picked`)
  }

  const label = level === 'supported'
    ? 'Outcome evidence: supported'
    : level === 'early'
      ? 'Outcome evidence: early'
      : judgeSupport > 0
        ? 'Outcome evidence: machine-only'
        : 'Outcome evidence: none yet'

  return {
    ...counts,
    humanSupport,
    humanPositiveShare,
    judgeSupport,
    judgePositiveShare,
    level,
    scope,
    label,
    detail: parts.join(' · '),
  }
}

/**
 * A small scalar for experiment selection only: lower support means a model is
 * more informative to test. This is not a quality score and must not be blended
 * into recommendation ranking.
 */
export function outcomeInformationScarcity(evidence: ModelOutcomeEvidence | null | undefined): number {
  if (!evidence) return 1
  return Math.max(0, 1 - Math.min(evidence.humanSupport, 8) / 8)
}
