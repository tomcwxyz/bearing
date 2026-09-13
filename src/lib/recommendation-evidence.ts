import { assessModelFreshness, type ModelFreshness } from './model-freshness'

export type EvidenceConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown'

export interface RecommendationEvidence {
  level: EvidenceConfidenceLevel
  label: string
  detail: string
  source: string | null
  verifiedAt: string | null
}

function sourceLabel(source: string | null | undefined): string {
  if (!source) return 'external catalogue'
  if (source === 'openrouter') return 'OpenRouter'
  if (source.startsWith('provider:')) return source.slice('provider:'.length)
  return source
}

/**
 * Turn catalogue freshness into user-facing evidence confidence.
 *
 * This is deliberately NOT part of ranking. A stale model should not receive
 * a mysterious hidden score penalty: Bearing keeps the recommendation order
 * stable and tells the user how current the supporting catalogue evidence is.
 */
export function recommendationEvidence(
  freshness: ModelFreshness | null | undefined,
  now: Date = new Date(),
): RecommendationEvidence {
  if (!freshness) {
    return {
      level: 'unknown',
      label: 'Evidence not verified',
      detail: 'Bearing has not yet recorded a catalogue verification for this model.',
      source: null,
      verifiedAt: null,
    }
  }

  const assessment = assessModelFreshness(freshness, now)
  const source = freshness.verification_source ?? null
  const verifiedAt = freshness.last_verified_at
    ? new Date(freshness.last_verified_at).toISOString()
    : null
  const sourceName = sourceLabel(source)

  if (assessment.status === 'unavailable') {
    return {
      level: 'low',
      label: 'Evidence confidence: low',
      detail: freshness.verification_note
        ? `${freshness.verification_note} Bearing has not removed the model automatically.`
        : `${sourceName} could not confirm this model on the latest check. Bearing has not removed it automatically.`,
      source,
      verifiedAt,
    }
  }

  if (assessment.status === 'attention') {
    return {
      level: 'low',
      label: 'Evidence confidence: low',
      detail: freshness.verification_note
        ? `Catalogue metadata needs review: ${freshness.verification_note}`
        : `Catalogue metadata from ${sourceName} has changed and needs review.`,
      source,
      verifiedAt,
    }
  }

  if (assessment.status === 'unknown') {
    return {
      level: 'unknown',
      label: 'Evidence not verified',
      detail: 'This model has not yet been checked against a current external catalogue.',
      source,
      verifiedAt,
    }
  }

  if (assessment.isStale) {
    const age = assessment.ageDays == null ? null : Math.floor(assessment.ageDays)
    return {
      level: 'medium',
      label: 'Evidence confidence: medium',
      detail: age == null
        ? `The last ${sourceName} verification is no longer recent enough to treat as current.`
        : `The last ${sourceName} verification was ${age} day${age === 1 ? '' : 's'} ago and is due to be refreshed.`,
      source,
      verifiedAt,
    }
  }

  const age = assessment.ageDays == null ? 0 : Math.floor(assessment.ageDays)
  return {
    level: 'high',
    label: 'Evidence confidence: high',
    detail: `Catalogue metadata was verified against ${sourceName} ${age === 0 ? 'within the last day' : `${age} day${age === 1 ? '' : 's'} ago`}.`,
    source,
    verifiedAt,
  }
}
