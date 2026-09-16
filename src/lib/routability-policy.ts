import type { RoutabilitySummary } from '@/db/model-routability'

export const ROUTABILITY_BLOCK_WINDOW_HOURS = 24
export const ROUTABILITY_MIN_CONSECUTIVE_FAILURES = 2

/**
 * A runtime observation is strong enough to suppress only after repeated,
 * recent, explicit unavailability. Degraded checks are never blocking.
 */
export function isBlockingRoutabilityObservation(
  observation: RoutabilitySummary,
  now = new Date(),
): boolean {
  if (observation.status !== 'unavailable') return false
  if (observation.consecutiveFailures < ROUTABILITY_MIN_CONSECUTIVE_FAILURES) return false

  const checkedAt = Date.parse(observation.checkedAt)
  if (!Number.isFinite(checkedAt)) return false

  const ageMs = now.getTime() - checkedAt
  return ageMs >= 0 && ageMs <= ROUTABILITY_BLOCK_WINDOW_HOURS * 60 * 60 * 1000
}
