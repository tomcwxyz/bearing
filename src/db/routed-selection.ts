import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export interface RoutedSelectionReason {
  modelSlug: string
  selectionReason: string
}

/**
 * Persist the inspectable rationale for an information-seeking route.
 *
 * Routed model rows are still created by the existing run repository; keeping
 * this small write in its own module avoids expanding the already-large db.ts
 * while the roadmap migration towards aggregate-specific repositories is under
 * way.
 */
export async function saveRoutedSelectionReasons(
  routedRunId: string,
  reasons: RoutedSelectionReason[],
): Promise<void> {
  if (reasons.length === 0) return

  const payload = JSON.stringify(reasons)
  await getDb()`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(
        "modelSlug" text,
        "selectionReason" text
      )
    )
    UPDATE routed_run_models AS m
    SET selection_reason = incoming."selectionReason"
    FROM incoming
    WHERE m.routed_run_id = ${routedRunId}
      AND m.model_slug = incoming."modelSlug"
  `
}
