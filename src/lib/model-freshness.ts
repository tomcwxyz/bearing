export type VerificationStatus = 'unknown' | 'current' | 'attention' | 'unavailable'

export interface ModelFreshness {
  last_verified_at?: string | Date | null
  verification_status?: VerificationStatus | null
  verification_source?: string | null
  verification_note?: string | null
}

export interface FreshnessAssessment {
  status: VerificationStatus
  ageDays: number | null
  isStale: boolean
  needsAttention: boolean
}

export const DEFAULT_STALE_AFTER_DAYS = 7

/**
 * Convert stored verification metadata into a small, deterministic freshness
 * assessment for admin and routing surfaces. Availability/status remains the
 * authoritative signal; age tells us when an apparently-current model is no
 * longer recent enough to trust without another check.
 */
export function assessModelFreshness(
  freshness: ModelFreshness,
  now: Date = new Date(),
  staleAfterDays = DEFAULT_STALE_AFTER_DAYS,
): FreshnessAssessment {
  const status = freshness.verification_status ?? 'unknown'
  const verifiedAt = freshness.last_verified_at ? new Date(freshness.last_verified_at) : null
  const validVerifiedAt = verifiedAt && Number.isFinite(verifiedAt.getTime()) ? verifiedAt : null
  const ageDays = validVerifiedAt
    ? Math.max(0, (now.getTime() - validVerifiedAt.getTime()) / 86_400_000)
    : null
  const isStale = ageDays == null || ageDays > staleAfterDays
  const needsAttention = status === 'attention' || status === 'unavailable' || status === 'unknown' || isStale

  return { status, ageDays, isStale, needsAttention }
}

export function freshnessLabel(assessment: FreshnessAssessment): string {
  if (assessment.status === 'unavailable') return 'Unavailable'
  if (assessment.status === 'attention') return 'Needs attention'
  if (assessment.status === 'unknown') return 'Not verified'
  if (assessment.isStale) return 'Verification stale'
  return 'Verified current'
}
