import { neon } from '@neondatabase/serverless'
import type { VerificationObservation } from './model-verification'

function db() {
  if (!process.env.NEON_DATABASE_URL) throw new Error('NEON_DATABASE_URL is not set')
  return neon(process.env.NEON_DATABASE_URL)
}

/** Append only real observations. Failed catalogue requests never produce evidence. */
export async function recordAvailabilityObservations(observations: VerificationObservation[]): Promise<void> {
  if (!observations.length) return
  const payload = JSON.stringify(observations)
  await db()`
    INSERT INTO model_availability_observations(model_slug, source, status, note, observed_at)
    SELECT x.slug, x.source, x.status, x.note, x."verifiedAt"
    FROM jsonb_to_recordset(${payload}::jsonb) AS x(
      slug text, status text, source text, note text, "verifiedAt" timestamptz
    )
    JOIN models m ON m.slug = x.slug
  `
}

export interface RetirementCandidate {
  slug: string
  name: string
  provider: string
  active: boolean
  missingChecks: number
  firstMissingAt: string
  lastMissingAt: string
  source: string
  note: string | null
}

/** Only sustained consecutive missing observations count; metadata drift is not retirement. */
export async function listRetirementCandidates(): Promise<RetirementCandidate[]> {
  const rows = await db()`
    WITH ordered AS (
      SELECT o.*, SUM(CASE WHEN status <> 'unavailable' THEN 1 ELSE 0 END)
        OVER (PARTITION BY model_slug, source ORDER BY observed_at DESC, id DESC) AS reset_group
      FROM model_availability_observations o
    ),
    streaks AS (
      SELECT model_slug, source, COUNT(*)::int AS missing_checks,
        MIN(observed_at) AS first_missing_at, MAX(observed_at) AS last_missing_at
      FROM ordered WHERE reset_group = 0 AND status = 'unavailable'
      GROUP BY model_slug, source
    )
    SELECT m.slug, m.name, m.provider, m.active,
      s.missing_checks, s.first_missing_at, s.last_missing_at,
      s.source, m.verification_note AS note
    FROM streaks s JOIN models m ON m.slug = s.model_slug
    WHERE s.missing_checks >= 2
      AND s.last_missing_at >= NOW() - INTERVAL '21 days'
      AND s.first_missing_at <= s.last_missing_at - INTERVAL '6 days'
      AND NOT EXISTS (
        SELECT 1 FROM model_availability_observations alternative
        WHERE alternative.model_slug = m.slug
          AND alternative.source <> s.source
          AND alternative.status = 'current'
          AND alternative.observed_at >= s.first_missing_at
      )
    ORDER BY s.missing_checks DESC, s.last_missing_at DESC
  `
  return rows.map(row => ({
    slug: String(row.slug), name: String(row.name), provider: String(row.provider),
    active: row.active === true, missingChecks: Number(row.missing_checks),
    firstMissingAt: String(row.first_missing_at), lastMissingAt: String(row.last_missing_at),
    source: String(row.source), note: row.note ? String(row.note) : null,
  }))
}
