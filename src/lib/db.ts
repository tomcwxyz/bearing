import { neon } from '@neondatabase/serverless'
import type { Model } from './registry'

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
  pipelineStages?: object[] | null
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
      classification_confidence,
      pipeline_stages
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
      ${params.classificationConfidence ?? null},
      ${params.pipelineStages ? JSON.stringify(params.pipelineStages) : null}
    )
    RETURNING id
  `
  return rows[0].id as string
}

/** Update the priority_order column on an existing task. */
export async function updateTaskPriorities(
  taskId: string,
  priorityOrder: string[],
  excludedFactors?: string[],
): Promise<void> {
  await getDb()`
    UPDATE tasks
    SET priority_order = ${JSON.stringify(priorityOrder)},
        excluded_factors = ${excludedFactors && excludedFactors.length > 0 ? JSON.stringify(excludedFactors) : null}
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

// ---------------------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------------------

/** Create a comparison record. Returns the comparison UUID. */
export async function createComparison(
  taskId: string,
  userId: string,
  modelASlug: string,
  modelBSlug: string,
): Promise<string> {
  const rows = await getDb()`
    INSERT INTO comparisons (task_id, user_id, model_a_slug, model_b_slug)
    VALUES (${taskId}, ${userId}, ${modelASlug}, ${modelBSlug})
    RETURNING id
  `
  return rows[0].id as string
}

/** Store the prompt hash on a comparison after content filter passes. */
export async function updateComparisonPrompt(
  comparisonId: string,
  promptHash: string,
): Promise<void> {
  await getDb()`
    UPDATE comparisons
    SET prompt_hash = ${promptHash}
    WHERE id = ${comparisonId}
  `
}

/** Record the user's preference on a comparison. */
export async function updateComparisonPreference(
  comparisonId: string,
  preferred: string,
  reason: string | null,
): Promise<void> {
  await getDb()`
    UPDATE comparisons
    SET preferred = ${preferred}, preference_reason = ${reason}
    WHERE id = ${comparisonId}
  `
}

/** Get the user's comparison count and date for rate limiting. */
export async function getUserComparisonCount(
  userId: string,
): Promise<{ count: number; date: string | null }> {
  const rows = await getDb()`
    SELECT comparisons_today, last_comparison_date
    FROM users
    WHERE id = ${userId}
  `
  if (rows.length === 0) return { count: 0, date: null }
  return {
    count: rows[0].comparisons_today ?? 0,
    date: rows[0].last_comparison_date ?? null,
  }
}

/** Increment the user's daily comparison count, resetting if it's a new day. */
export async function incrementUserComparisons(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  await getDb()`
    UPDATE users
    SET
      comparisons_today = CASE
        WHEN last_comparison_date = ${today} THEN comparisons_today + 1
        ELSE 1
      END,
      last_comparison_date = ${today}
    WHERE id = ${userId}
  `
}

/** Get a comparison record by ID. */
export async function getComparison(comparisonId: string) {
  const rows = await getDb()`
    SELECT * FROM comparisons WHERE id = ${comparisonId}
  `
  return rows[0] ?? undefined
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/** Convert a DB row to the Model interface used by the rest of the app. */
export function modelRowToModel(row: any): Model {
  return {
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    tier: row.tier,
    pricing: row.pricing,
    context_window: row.context_window,
    capabilities: row.capabilities,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    task_fitness: row.task_fitness,
    speed_score: row.speed_score,
    privacy_score: row.privacy_score,
    transparency: row.transparency,
    sustainability: row.sustainability,
    ...(row.local_info ? { local_info: row.local_info } : {}),
  }
}

/** Fetch all active models from the database. */
export async function getAllModelsFromDb(): Promise<Model[]> {
  const rows = await getDb()`
    SELECT * FROM models WHERE active = true ORDER BY name
  `
  return rows.map(modelRowToModel)
}

/** Fetch a single model by slug. */
export async function getModelFromDb(slug: string): Promise<Model | null> {
  const rows = await getDb()`
    SELECT * FROM models WHERE slug = ${slug}
  `
  return rows.length > 0 ? modelRowToModel(rows[0]) : null
}

/** Get the openrouter_id for a model slug. Returns null if not found or not mapped. */
export async function getOpenRouterId(slug: string): Promise<string | null> {
  const rows = await getDb()`
    SELECT openrouter_id FROM models WHERE slug = ${slug}
  `
  return rows.length > 0 ? (rows[0].openrouter_id as string | null) : null
}

/** Insert or update a model. */
export async function upsertModel(model: {
  slug: string; name: string; provider: string; tier: string;
  pricing: { input_per_1m: number; output_per_1m: number };
  context_window: number; capabilities: string[]; strengths: string[];
  weaknesses: string[]; task_fitness: Record<string, number>;
  speed_score: number; privacy_score: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transparency: any; sustainability: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  local_info?: any;
  openrouter_id?: string | null;
  active?: boolean;
}): Promise<void> {
  await getDb()`
    INSERT INTO models (
      slug, name, provider, tier, pricing, context_window,
      capabilities, strengths, weaknesses, task_fitness,
      speed_score, privacy_score, transparency, sustainability,
      local_info, openrouter_id, active
    ) VALUES (
      ${model.slug}, ${model.name}, ${model.provider}, ${model.tier},
      ${JSON.stringify(model.pricing)}::jsonb, ${model.context_window},
      ${model.capabilities}::text[], ${model.strengths}::text[], ${model.weaknesses}::text[],
      ${JSON.stringify(model.task_fitness)}::jsonb,
      ${model.speed_score}, ${model.privacy_score},
      ${JSON.stringify(model.transparency)}::jsonb,
      ${JSON.stringify(model.sustainability)}::jsonb,
      ${model.local_info ? JSON.stringify(model.local_info) : null}::jsonb,
      ${model.openrouter_id ?? null},
      ${model.active ?? true}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, provider = EXCLUDED.provider, tier = EXCLUDED.tier,
      pricing = EXCLUDED.pricing, context_window = EXCLUDED.context_window,
      capabilities = EXCLUDED.capabilities, strengths = EXCLUDED.strengths,
      weaknesses = EXCLUDED.weaknesses, task_fitness = EXCLUDED.task_fitness,
      speed_score = EXCLUDED.speed_score, privacy_score = EXCLUDED.privacy_score,
      transparency = EXCLUDED.transparency, sustainability = EXCLUDED.sustainability,
      local_info = EXCLUDED.local_info, openrouter_id = EXCLUDED.openrouter_id,
      updated_at = now()
  `
}

/** Update pricing for a model by slug. */
export async function updateModelPricing(slug: string, pricing: { input_per_1m: number; output_per_1m: number }): Promise<void> {
  await getDb()`
    UPDATE models SET pricing = ${JSON.stringify(pricing)}::jsonb, updated_at = now()
    WHERE slug = ${slug}
  `
}

/** Get all openrouter_id values from the models table. */
export async function getOpenRouterIds(): Promise<Map<string, string>> {
  const rows = await getDb()`SELECT slug, openrouter_id FROM models WHERE openrouter_id IS NOT NULL`
  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(row.openrouter_id as string, row.slug as string)
  }
  return map
}

/** Soft-delete a model by marking it inactive. */
export async function deactivateModel(slug: string): Promise<void> {
  await getDb()`UPDATE models SET active = false, updated_at = now() WHERE slug = ${slug}`
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** Check whether a user has admin privileges. */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const rows = await getDb()`SELECT is_admin FROM users WHERE id = ${userId}`
  return rows.length > 0 && rows[0].is_admin === true
}
