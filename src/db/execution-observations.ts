import { neon } from '@neondatabase/serverless'
import type { ExecutionObservationInput } from '@/lib/execution-evidence'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

/**
 * Persist observed execution evidence separately from recommendation/fit data.
 * Callers should only use this when a run actually happened.
 */
export async function saveExecutionObservation(
  observation: ExecutionObservationInput,
): Promise<string> {
  const sql = getDb()
  const modelRows = await sql`
    SELECT provider, model_class, transparency, local_info
    FROM models
    WHERE slug = ${observation.modelSlug}
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
        snapshot_source: 'execution_time_catalogue',
      }
    : null

  const rows = await sql`
    INSERT INTO execution_observations (
      task_id,
      selection_id,
      routed_run_id,
      model_slug,
      model_metadata_snapshot,
      execution_location,
      runtime,
      runtime_model_id,
      quant,
      context_length,
      hardware_profile,
      measured_vram_gb,
      tokens_per_second,
      latency_ms,
      evidence_source
    ) VALUES (
      ${observation.taskId},
      ${observation.selectionId ?? null},
      ${observation.routedRunId ?? null},
      ${observation.modelSlug},
      ${modelSnapshot ? JSON.stringify(modelSnapshot) : null}::jsonb,
      ${observation.executionLocation},
      ${observation.runtime ?? null},
      ${observation.runtimeModelId ?? null},
      ${observation.quant ?? null},
      ${observation.contextLength ?? null},
      ${observation.hardwareProfile ? JSON.stringify(observation.hardwareProfile) : null}::jsonb,
      ${observation.measuredVramGb ?? null},
      ${observation.tokensPerSecond ?? null},
      ${observation.latencyMs ?? null},
      ${observation.evidenceSource}
    )
    RETURNING id
  `
  return rows[0].id as string
}
