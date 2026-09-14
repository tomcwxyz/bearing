import { neon } from '@neondatabase/serverless'
import type { Classification } from '@/lib/classification'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export interface CreateOwnedTaskInput {
  userId?: string | null
  descriptionHash?: string | null
  taskType?: string | null
  taskSubtype?: string | null
  complexity?: string | null
  inputLength?: string | null
  needsVision?: boolean
  needsTools?: boolean
  needsCode?: boolean
  needsReasoning?: boolean
  isRecurring?: boolean
  dataSensitivity?: string
  latencyTarget?: string
  volume?: string
  needsLongContext?: boolean
  needsMultilingual?: boolean
  isAgentic?: boolean
  outputLength?: string
  mode?: string
  priorityOrder?: string[]
  classificationConfidence?: number | null
  pipelineStages?: object[] | null
}

export interface OwnedTaskSummary {
  id: string
  createdAt: string
  taskType: string
  taskSubtype: string | null
  complexity: string | null
  mode: string
  bestModelSlug: string | null
  hasPipeline: boolean
}

function schemaVersionFor(taskType?: string | null): string {
  return taskType === 'embedding' ? 'v0.9' : 'v0.8'
}

function isMissingOwnershipColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return candidate.code === '42703' || (
    typeof candidate.message === 'string' &&
    candidate.message.includes('user_id') &&
    candidate.message.toLowerCase().includes('column')
  )
}

/**
 * Create a task with its owner in the same INSERT when the user is signed in.
 * Anonymous tasks remain unowned. During migration rollout, a database that
 * has not received migration 030 yet falls back to the legacy unowned insert
 * rather than breaking task creation for signed-in users.
 */
export async function createTaskWithOwner(input: CreateOwnedTaskInput): Promise<string> {
  const sql = getDb()
  const schemaVersion = schemaVersionFor(input.taskType)

  if (input.userId) {
    try {
      const rows = await sql`
        INSERT INTO tasks (
          user_id,
          description_hash,
          task_type,
          task_subtype,
          complexity,
          input_length,
          needs_vision,
          needs_tools,
          needs_code,
          needs_reasoning,
          is_recurring,
          data_sensitivity,
          latency_target,
          volume,
          needs_long_context,
          needs_multilingual,
          is_agentic,
          output_length,
          mode,
          priority_order,
          classification_confidence,
          pipeline_stages,
          classification_schema_version
        ) VALUES (
          ${input.userId},
          ${input.descriptionHash ?? null},
          ${input.taskType ?? null},
          ${input.taskSubtype ?? null},
          ${input.complexity ?? null},
          ${input.inputLength ?? null},
          ${input.needsVision ?? false},
          ${input.needsTools ?? false},
          ${input.needsCode ?? false},
          ${input.needsReasoning ?? false},
          ${input.isRecurring ?? false},
          ${input.dataSensitivity ?? 'none'},
          ${input.latencyTarget ?? 'interactive'},
          ${input.volume ?? 'one_off'},
          ${input.needsLongContext ?? false},
          ${input.needsMultilingual ?? false},
          ${input.isAgentic ?? false},
          ${input.outputLength ?? 'medium'},
          ${input.mode ?? 'recommend'},
          ${input.priorityOrder ? JSON.stringify(input.priorityOrder) : null},
          ${input.classificationConfidence ?? null},
          ${input.pipelineStages ? JSON.stringify(input.pipelineStages) : null},
          ${schemaVersion}
        )
        RETURNING id
      `
      return rows[0].id as string
    } catch (error) {
      if (!isMissingOwnershipColumn(error)) throw error
      console.warn('[tasks] task ownership migration is not applied; creating task anonymously')
    }
  }

  const rows = await sql`
    INSERT INTO tasks (
      description_hash,
      task_type,
      task_subtype,
      complexity,
      input_length,
      needs_vision,
      needs_tools,
      needs_code,
      needs_reasoning,
      is_recurring,
      data_sensitivity,
      latency_target,
      volume,
      needs_long_context,
      needs_multilingual,
      is_agentic,
      output_length,
      mode,
      priority_order,
      classification_confidence,
      pipeline_stages,
      classification_schema_version
    ) VALUES (
      ${input.descriptionHash ?? null},
      ${input.taskType ?? null},
      ${input.taskSubtype ?? null},
      ${input.complexity ?? null},
      ${input.inputLength ?? null},
      ${input.needsVision ?? false},
      ${input.needsTools ?? false},
      ${input.needsCode ?? false},
      ${input.needsReasoning ?? false},
      ${input.isRecurring ?? false},
      ${input.dataSensitivity ?? 'none'},
      ${input.latencyTarget ?? 'interactive'},
      ${input.volume ?? 'one_off'},
      ${input.needsLongContext ?? false},
      ${input.needsMultilingual ?? false},
      ${input.isAgentic ?? false},
      ${input.outputLength ?? 'medium'},
      ${input.mode ?? 'recommend'},
      ${input.priorityOrder ? JSON.stringify(input.priorityOrder) : null},
      ${input.classificationConfidence ?? null},
      ${input.pipelineStages ? JSON.stringify(input.pipelineStages) : null},
      ${schemaVersion}
    )
    RETURNING id
  `
  return rows[0].id as string
}

/** Persist a re-classification after a clarification round. */
export async function updateTaskClassification(
  taskId: string,
  classification: Classification,
): Promise<void> {
  await getDb()`
    UPDATE tasks
    SET
      task_type = ${classification.task_type},
      task_subtype = ${classification.task_subtype},
      complexity = ${classification.complexity},
      input_length = ${classification.input_length},
      needs_vision = ${classification.needs_vision},
      needs_tools = ${classification.needs_tools},
      needs_code = ${classification.needs_code},
      needs_reasoning = ${classification.needs_reasoning},
      is_recurring = ${classification.is_recurring},
      data_sensitivity = ${classification.data_sensitivity},
      latency_target = ${classification.latency_target},
      volume = ${classification.volume},
      needs_long_context = ${classification.needs_long_context},
      needs_multilingual = ${classification.needs_multilingual},
      is_agentic = ${classification.is_agentic},
      output_length = ${classification.output_length},
      classification_confidence = ${classification.confidence},
      pipeline_stages = ${classification.pipeline_stages ? JSON.stringify(classification.pipeline_stages) : null},
      classification_schema_version = ${schemaVersionFor(classification.task_type)}
    WHERE id = ${taskId}
  `
}

/**
 * Return only bearings that reached a persisted recommendation. An unfinished
 * clarification cannot be resumed across devices because Bearing deliberately
 * does not store raw task descriptions, so presenting those as resumable would
 * be misleading.
 */
export async function listCompletedTasksForUser(
  userId: string,
  limit = 20,
): Promise<OwnedTaskSummary[]> {
  try {
    const rows = await getDb()`
      SELECT
        t.id,
        t.created_at,
        t.task_type,
        t.task_subtype,
        t.complexity,
        COALESCE(t.mode, 'recommend') AS mode,
        t.pipeline_stages IS NOT NULL AS has_pipeline,
        (
          SELECT r.model_slug
          FROM recommendations r
          WHERE r.task_id = t.id AND r.rank = 1
          ORDER BY r.created_at DESC
          LIMIT 1
        ) AS best_model_slug
      FROM tasks t
      WHERE t.user_id = ${userId}
        AND COALESCE(t.mode, 'recommend') IN ('recommend', 'embedding')
        AND EXISTS (
          SELECT 1 FROM recommendations completed WHERE completed.task_id = t.id
        )
      ORDER BY t.created_at DESC
      LIMIT ${Math.max(1, Math.min(limit, 100))}
    `

    return rows.map((row) => ({
      id: String(row.id),
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
      taskType: String(row.task_type ?? 'unknown'),
      taskSubtype: row.task_subtype == null ? null : String(row.task_subtype),
      complexity: row.complexity == null ? null : String(row.complexity),
      mode: String(row.mode ?? 'recommend'),
      bestModelSlug: row.best_model_slug == null ? null : String(row.best_model_slug),
      hasPipeline: Boolean(row.has_pipeline),
    }))
  } catch (error) {
    if (isMissingOwnershipColumn(error)) return []
    throw error
  }
}
