import { neon } from '@neondatabase/serverless'
import type { SelectionChoiceContext } from '@/lib/selection-context'

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
  choiceContext: SelectionChoiceContext | null = null,
): Promise<string> {
  const sql = getDb()
  const modelRows = await sql`
    SELECT provider, model_class, transparency, local_info
    FROM models
    WHERE slug = ${modelSlug}
  `
  const model = modelRows[0]
  const transparency = model?.transparency as Record<string, unknown> | undefined
  const openWeights = Number(transparency?.open_weights ?? 0)
  const licenceOpenness = Number(transparency?.licence_openness ?? 0)
  const modelSnapshot = model
    ? {
        provider: String(model.provider ?? ''),
        model_class: String(model.model_class ?? 'chat'),
        open_weights: Number.isFinite(openWeights) ? openWeights : 0,
        licence_openness: Number.isFinite(licenceOpenness) ? licenceOpenness : 0,
        is_open_weight: Number.isFinite(openWeights) && openWeights >= 0.8,
        local_capable: Boolean(model.local_info),
        snapshot_source: 'selection_time_catalogue',
      }
    : null

  const rows = await sql`
    INSERT INTO selections (
      task_id, model_slug, recommended_rank, source,
      model_metadata_snapshot, choice_context
    )
    VALUES (
      ${taskId}, ${modelSlug}, ${recommendedRank}, ${source},
      ${modelSnapshot ? JSON.stringify(modelSnapshot) : null}::jsonb,
      ${choiceContext ? JSON.stringify(choiceContext) : null}::jsonb
    )
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
