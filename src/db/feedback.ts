import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

/** Record which model the user selected. Returns the selection UUID. */
export async function saveSelection(
  taskId: string,
  modelSlug: string,
  recommendedRank: number | null,
  source: string = 'recommend',
): Promise<string> {
  const rows = await getDb()`
    INSERT INTO selections (task_id, model_slug, recommended_rank, source)
    VALUES (${taskId}, ${modelSlug}, ${recommendedRank}, ${source})
    RETURNING id
  `
  return rows[0].id as string
}

/** Save an explicit success/failure outcome for a selection. */
export async function saveOutcome(
  taskId: string,
  selectionId: string,
  success: boolean | null,
  failureReason: string | null,
  feedback: string | null,
): Promise<void> {
  await getDb()`
    INSERT INTO outcomes (task_id, selection_id, success, failure_reason, feedback)
    VALUES (${taskId}, ${selectionId}, ${success}, ${failureReason}, ${feedback})
  `
}
