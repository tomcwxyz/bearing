import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskParams {
  descriptionHash?: string
  taskType?: string
  taskSubtype?: string
  complexity?: string
  inputLength?: string
  needsVision?: boolean
  needsTools?: boolean
  needsCode?: boolean
  isRecurring?: boolean
  mode?: string
  priorityOrder?: string[]
  classificationConfidence?: number
}

export interface RecommendationInput {
  modelSlug: string
  rank: number
  weightedScore: number
  factorScores: Record<string, number>
  reasoning?: string
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** Insert a new task row and return its UUID. */
export async function createTask(params: TaskParams): Promise<string> {
  const rows = await getDb()`
    INSERT INTO tasks (
      description_hash,
      task_type,
      task_subtype,
      complexity,
      input_length,
      needs_vision,
      needs_tools,
      needs_code,
      is_recurring,
      mode,
      priority_order,
      classification_confidence
    ) VALUES (
      ${params.descriptionHash ?? null},
      ${params.taskType ?? null},
      ${params.taskSubtype ?? null},
      ${params.complexity ?? null},
      ${params.inputLength ?? null},
      ${params.needsVision ?? false},
      ${params.needsTools ?? false},
      ${params.needsCode ?? false},
      ${params.isRecurring ?? false},
      ${params.mode ?? 'recommend'},
      ${params.priorityOrder ? JSON.stringify(params.priorityOrder) : null},
      ${params.classificationConfidence ?? null}
    )
    RETURNING id
  `
  return rows[0].id as string
}

/** Update the priority_order column on an existing task. */
export async function updateTaskPriorities(
  taskId: string,
  priorityOrder: string[],
): Promise<void> {
  await getDb()`
    UPDATE tasks
    SET priority_order = ${JSON.stringify(priorityOrder)}
    WHERE id = ${taskId}
  `
}

/** Fetch a single task by ID. Returns undefined if not found. */
export async function getTask(taskId: string) {
  const rows = await getDb()`
    SELECT * FROM tasks WHERE id = ${taskId}
  `
  return rows[0] ?? undefined
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

/** Insert one recommendation row per model for the given task. */
export async function saveRecommendations(
  taskId: string,
  models: RecommendationInput[],
): Promise<void> {
  for (const model of models) {
    await getDb()`
      INSERT INTO recommendations (
        task_id, model_slug, rank, weighted_score, factor_scores, reasoning
      ) VALUES (
        ${taskId},
        ${model.modelSlug},
        ${model.rank},
        ${model.weightedScore},
        ${JSON.stringify(model.factorScores)},
        ${model.reasoning ?? null}
      )
    `
  }
}

// ---------------------------------------------------------------------------
// Selections
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/** Save the outcome (success/failure + optional feedback) for a selection. */
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
