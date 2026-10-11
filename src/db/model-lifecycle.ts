import { neon } from '@neondatabase/serverless'

function db() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

/** Atomically retire live models or explicitly archive legacy inactive rows.
 * The accompanying audit events are written in the same PostgreSQL statement.
 * If the record was changed by another admin, it is silently skipped and
 * returned to the caller as not transitioned. Historical references survive. */
export async function retireModels(
  slugs: string[],
  reason: string,
  actor: string,
  from: 'live' | 'draft' = 'live',
): Promise<string[]> {
  if (!slugs.length) return []
  const rows = await db()`
    WITH changed AS (
      UPDATE models AS m
      SET active = false,
          retired_at = NOW(),
          retirement_reason = ${reason},
          retired_by = ${actor},
          updated_at = NOW()
      WHERE m.slug = ANY(${slugs}::text[])
        AND m.retired_at IS NULL
        AND (
          (${from} = 'live' AND m.active = true)
          OR (${from} = 'draft' AND m.active = false)
        )
      RETURNING m.slug
    ),
    audited AS (
      INSERT INTO model_lifecycle_events(model_slug, from_status, to_status, reason, changed_by)
      SELECT slug, ${from}, 'retired', ${reason}, ${actor}
      FROM changed
      RETURNING model_slug
    )
    SELECT model_slug FROM audited
  `
  return rows.map(row => String(row.model_slug))
}

/** Restoring is explicit: a retired model returns directly to live, never to
 * the draft queue. Prior reasons and audit history remain in the event table. */
export async function restoreRetiredModels(
  slugs: string[],
  reason: string,
  actor: string,
): Promise<string[]> {
  if (!slugs.length) return []
  const rows = await db()`
    WITH changed AS (
      UPDATE models AS m
      SET active = true,
          retired_at = NULL,
          retirement_reason = NULL,
          retired_by = NULL,
          updated_at = NOW()
      WHERE m.slug = ANY(${slugs}::text[])
        AND m.active = false
        AND m.retired_at IS NOT NULL
      RETURNING m.slug
    ),
    audited AS (
      INSERT INTO model_lifecycle_events(model_slug, from_status, to_status, reason, changed_by)
      SELECT slug, 'retired', 'live', ${reason}, ${actor}
      FROM changed
      RETURNING model_slug
    )
    SELECT model_slug FROM audited
  `
  return rows.map(row => String(row.model_slug))
}
