import type { RecommendationEvidence } from './recommendation-evidence'

export type RecommendationConfidenceLevel = 'high' | 'medium' | 'low'

export interface RecommendationConfidence {
  level: RecommendationConfidenceLevel
  label: string
  detail: string
  shouldChallenge: boolean
  scoreSeparation: number | null
}

export interface RecommendationConfidenceInput {
  classificationConfidence?: number | null
  topScore?: number | null
  secondScore?: number | null
  evidence?: RecommendationEvidence | null
}

function scoreSeparation(topScore?: number | null, secondScore?: number | null): number | null {
  if (topScore == null || secondScore == null) return null
  const denominator = Math.max(Math.abs(topScore), 0.01)
  return Math.max(0, topScore - secondScore) / denominator
}

/**
 * Describe confidence in the recommendation decision, rather than pretending
 * the weighted score is a calibrated probability.
 *
 * This first version uses signals Bearing already has everywhere: classifier
 * confidence, separation between the leading candidates, and freshness of the
 * catalogue evidence behind the top recommendation. Benchmark agreement and
 * outcome support can be added later without changing the UI contract.
 */
export function recommendationConfidence(
  input: RecommendationConfidenceInput,
): RecommendationConfidence {
  const classification = input.classificationConfidence ?? null
  const separation = scoreSeparation(input.topScore, input.secondScore)
  const evidenceLevel = input.evidence?.level ?? 'unknown'

  const classificationLow = classification != null && classification < 0.65
  const classificationStrong = classification != null && classification >= 0.8
  const veryClose = separation != null && separation < 0.025
  const clearlySeparated = separation != null && separation >= 0.08
  const weakEvidence = evidenceLevel === 'low'
  const strongEvidence = evidenceLevel === 'high'

  if (classificationLow || veryClose || weakEvidence) {
    const reasons: string[] = []
    if (classificationLow) reasons.push('the task classification is still somewhat uncertain')
    if (veryClose) reasons.push('the leading models are very close in the ranking')
    if (weakEvidence) reasons.push('the top model has catalogue evidence that needs attention')

    return {
      level: 'low',
      label: 'Recommendation confidence: low',
      detail: `${reasons.join('; ')}. This is a good candidate for a challenge or comparison before committing.`,
      shouldChallenge: true,
      scoreSeparation: separation,
    }
  }

  if (classificationStrong && clearlySeparated && strongEvidence) {
    return {
      level: 'high',
      label: 'Recommendation confidence: high',
      detail: 'The task classification is strong, the leading recommendation is clearly separated, and its catalogue evidence is current.',
      shouldChallenge: false,
      scoreSeparation: separation,
    }
  }

  const reasons: string[] = []
  if (classification == null) reasons.push('classification confidence is unavailable')
  else if (!classificationStrong) reasons.push('the task classification is adequate rather than strong')

  if (separation == null) reasons.push('there is no second candidate to compare against')
  else if (!clearlySeparated) reasons.push('the leading candidates are fairly close')

  if (evidenceLevel === 'unknown') reasons.push('catalogue evidence has not yet been verified')
  else if (evidenceLevel === 'medium') reasons.push('catalogue evidence is due for refresh')

  return {
    level: 'medium',
    label: 'Recommendation confidence: medium',
    detail: reasons.length > 0
      ? `${reasons.join('; ')}. The recommendation is usable, but testing a strong alternative may still be informative.`
      : 'The recommendation is supported, but the available evidence does not justify a high-confidence label yet.',
    shouldChallenge: separation != null && separation < 0.05,
    scoreSeparation: separation,
  }
}
