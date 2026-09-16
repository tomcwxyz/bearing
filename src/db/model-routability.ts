import { neon } from '@neondatabase/serverless'

import {
  ROUTABILITY_BLOCK_WINDOW_HOURS,
  ROUTABILITY_MIN_CONSECUTIVE_FAILURES,
} from '@/lib/routability-policy'

export type RoutabilityStatus = 'unknown' | 'healthy' | 'degraded' | 'unavailable'

export interface RoutabilityCandidate {
  slug: string
  name: string
  openrouterId: string | null
}

export interface RoutabilityObservation {
  slug: string
  status: RoutabilityStatus
  source: string
  note: string | null
  checkedAt: string
}

export interface RoutabilitySummary extends RoutabilityObservation {
  consecutiveFailures: number
}

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

/**
 * Runtime canaries only make sense for active chat models that have an
 * execution path. Direct-provider-only slugs are added by the orchestration
 * layer because that mapping intentionally lives outside the database.
 */
export async function listRoutabilityCandidates(): Promise<RoutabilityCandidate[]> {
  const rows = await getDb()`
    SELECT slug, name, openrouter_id
    FROM models
    WHERE active = true
      AND COALESCE(model_class, 'chat') = 'chat'
    ORDER BY name
  `

  return rows.map((row) => ({
    slug: row.slug as string,
    name: row.name as string,
    openrouterId: (row.openrouter_id as string | null) ?? null,
  }))
}

/** Persist observations without changing catalogue metadata or active state. */
export async function saveRoutabilityObservations(
  observations: RoutabilityObservation[],
): Promise<void> {
  if (observations.length === 0) return

  const payload = JSON.stringify(observations)
  await getDb()`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(
        slug text,
        status text,
        source text,
        note text,
        "checkedAt" timestamptz
      )
    )
    INSERT INTO model_routability (
      model_slug,
      status,
      last_checked_at,
      source,
      note,
      consecutive_failures,
      updated_at
    )
    SELECT
      incoming.slug,
      incoming.status,
      incoming."checkedAt",
      incoming.source,
      incoming.note,
      CASE WHEN incoming.status = 'healthy' THEN 0 ELSE 1 END,
      NOW()
    FROM incoming
    ON CONFLICT (model_slug) DO UPDATE SET
      status = EXCLUDED.status,
      last_checked_at = EXCLUDED.last_checked_at,
      source = EXCLUDED.source,
      note = EXCLUDED.note,
      consecutive_failures = CASE
        WHEN EXCLUDED.status = 'healthy' THEN 0
        ELSE model_routability.consecutive_failures + 1
      END,
      updated_at = NOW()
  `
}

export async function getRoutabilitySummaries(): Promise<RoutabilitySummary[]> {
  try {
    const rows = await getDb()`
      SELECT model_slug, status, last_checked_at, source, note, consecutive_failures
      FROM model_routability
      ORDER BY last_checked_at DESC NULLS LAST, model_slug
    `

    return rows.map((row) => ({
      slug: row.model_slug as string,
      status: row.status as RoutabilityStatus,
      source: (row.source as string | null) ?? 'unknown',
      note: (row.note as string | null) ?? null,
      checkedAt: row.last_checked_at ? String(row.last_checked_at) : '',
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
    }))
  } catch (error) {
    // Keep the application deploy-safe while migration 028 is rolling out.
    console.warn('[routability] summaries unavailable; migration may be pending', error)
    return []
  }
}

/**
 * Only repeated, explicit and recently-confirmed model unavailability can block
 * auto-routing. Degraded observations (rate limits, 5xx, auth/config/network
 * failures) never suppress a model because they do not establish that the
 * model itself is gone. This helper remains fail-open if persistence is
 * unavailable.
 */
export async function getRecentlyUnavailableModelSlugs(): Promise<Set<string>> {
  try {
    const rows = await getDb()`
      SELECT model_slug
      FROM model_routability
      WHERE status = 'unavailable'
        AND consecutive_failures >= ${ROUTABILITY_MIN_CONSECUTIVE_FAILURES}
        AND last_checked_at >= NOW() - (${ROUTABILITY_BLOCK_WINDOW_HOURS} * INTERVAL '1 hour')
    `
    return new Set(rows.map((row) => row.model_slug as string))
  } catch (error) {
    console.warn('[routability] routing guard unavailable; migration may be pending', error)
    return new Set()
  }
}
