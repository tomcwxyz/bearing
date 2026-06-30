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
  // Embedding tasks follow schema v0.9 which introduced the embedding task type;
  // all other task types remain on v0.8.
  const schemaVersion = params.taskType === 'embedding' ? 'v0.9' : 'v0.8'
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
      ${params.descriptionHash ?? null},
      ${params.taskType ?? null},
      ${params.taskSubtype ?? null},
      ${params.complexity ?? null},
      ${params.inputLength ?? null},
      ${params.needsVision ?? false},
      ${params.needsTools ?? false},
      ${params.needsCode ?? false},
      ${params.needsReasoning ?? false},
      ${params.isRecurring ?? false},
      ${params.dataSensitivity ?? 'none'},
      ${params.latencyTarget ?? 'interactive'},
      ${params.volume ?? 'one_off'},
      ${params.needsLongContext ?? false},
      ${params.needsMultilingual ?? false},
      ${params.isAgentic ?? false},
      ${params.outputLength ?? 'medium'},
      ${params.mode ?? 'recommend'},
      ${params.priorityOrder ? JSON.stringify(params.priorityOrder) : null},
      ${params.classificationConfidence ?? null},
      ${params.pipelineStages ? JSON.stringify(params.pipelineStages) : null},
      ${schemaVersion}
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
// Local recommendations (open-weight models for local inference)
// ---------------------------------------------------------------------------

export interface LocalRecommendationInput {
  modelSlug: string
  rank: number
  effectiveQuality: number
  quant: string
  vramGb: number
  qualityPenalty: number
  hardwareTierId: string
}

/** Insert one row per ranked local candidate. Zero rows means the recommender
 *  produced no viable local suggestion for this task. */
export async function saveLocalRecommendations(
  taskId: string,
  candidates: LocalRecommendationInput[],
): Promise<void> {
  for (const c of candidates) {
    await getDb()`
      INSERT INTO local_recommendations (
        task_id, model_slug, rank, effective_quality,
        quant, vram_gb, quality_penalty, hardware_tier_id
      ) VALUES (
        ${taskId},
        ${c.modelSlug},
        ${c.rank},
        ${c.effectiveQuality},
        ${c.quant},
        ${c.vramGb},
        ${c.qualityPenalty},
        ${c.hardwareTierId}
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

/**
 * Convert a raw `models` table row to the Model interface used by the rest of
 * the app. The driver hands rows back untyped, so we cast each column to its
 * Model field type (via indexed access) rather than leaning on `any`.
 */
export function modelRowToModel(row: Record<string, unknown>): Model {
  return {
    slug: row.slug as string,
    name: row.name as string,
    provider: row.provider as string,
    tier: row.tier as string,
    // model_class falls back to 'chat' for rows written before migration 021
    // (the column defaults to 'chat' in the schema, so this is belt-and-
    // braces against any code path that constructs a row without it).
    model_class: (row.model_class as Model['model_class']) ?? 'chat',
    pricing: row.pricing as Model['pricing'],
    context_window: row.context_window as number,
    capabilities: row.capabilities as Model['capabilities'],
    strengths: row.strengths as string[],
    weaknesses: row.weaknesses as string[],
    task_fitness: row.task_fitness as Model['task_fitness'],
    speed_score: row.speed_score as number,
    privacy_score: row.privacy_score as number,
    transparency: row.transparency as Model['transparency'],
    sustainability: row.sustainability as Model['sustainability'],
    ...(row.local_info ? { local_info: row.local_info as Model['local_info'] } : {}),
    ...(row.embedding_dim != null ? { embedding_dim: row.embedding_dim as number } : {}),
    ...(row.max_input_tokens != null ? { max_input_tokens: row.max_input_tokens as number } : {}),
    ...(row.supports_matryoshka != null ? { supports_matryoshka: row.supports_matryoshka as boolean } : {}),
  }
}

/** Fetch all active models from the database. */
export async function getAllModelsFromDb(): Promise<Model[]> {
  const rows = await getDb()`
    SELECT * FROM models WHERE active = true ORDER BY name
  `
  return rows.map(modelRowToModel)
}

/** Admin-only variant: returns all models (including drafts) with the active flag. */
export type AdminModel = Model & { active: boolean }

export async function getAllModelsForAdmin(): Promise<AdminModel[]> {
  const rows = await getDb()`
    SELECT * FROM models ORDER BY active DESC, name
  `
  return rows.map((row) => ({ ...modelRowToModel(row), active: row.active as boolean }))
}

/** Fetch a single model by slug. */
export async function getModelFromDb(slug: string): Promise<Model | null> {
  const rows = await getDb()`
    SELECT * FROM models WHERE slug = ${slug}
  `
  return rows.length > 0 ? modelRowToModel(rows[0]) : null
}

/** Admin-only variant: includes the active flag so the edit UI can show Draft/Active. */
export async function getModelForAdmin(slug: string): Promise<AdminModel | null> {
  const rows = await getDb()`
    SELECT * FROM models WHERE slug = ${slug}
  `
  if (rows.length === 0) return null
  return { ...modelRowToModel(rows[0]), active: rows[0].active as boolean }
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
  // v0.9 fields. Defaults preserve chat-model behaviour for all existing
  // call sites; embedding seed scripts pass these explicitly.
  model_class?: 'chat' | 'embedding';
  embedding_dim?: number | null;
  max_input_tokens?: number | null;
  supports_matryoshka?: boolean;
}): Promise<void> {
  await getDb()`
    INSERT INTO models (
      slug, name, provider, tier, pricing, context_window,
      capabilities, strengths, weaknesses, task_fitness,
      speed_score, privacy_score, transparency, sustainability,
      local_info, openrouter_id, active,
      model_class, embedding_dim, max_input_tokens, supports_matryoshka
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
      ${model.active ?? true},
      ${model.model_class ?? 'chat'},
      ${model.embedding_dim ?? null},
      ${model.max_input_tokens ?? null},
      ${model.supports_matryoshka ?? false}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, provider = EXCLUDED.provider, tier = EXCLUDED.tier,
      pricing = EXCLUDED.pricing, context_window = EXCLUDED.context_window,
      capabilities = EXCLUDED.capabilities, strengths = EXCLUDED.strengths,
      weaknesses = EXCLUDED.weaknesses, task_fitness = EXCLUDED.task_fitness,
      speed_score = EXCLUDED.speed_score, privacy_score = EXCLUDED.privacy_score,
      transparency = EXCLUDED.transparency, sustainability = EXCLUDED.sustainability,
      local_info = EXCLUDED.local_info, openrouter_id = EXCLUDED.openrouter_id,
      active = EXCLUDED.active,
      model_class = EXCLUDED.model_class,
      embedding_dim = EXCLUDED.embedding_dim,
      max_input_tokens = EXCLUDED.max_input_tokens,
      supports_matryoshka = EXCLUDED.supports_matryoshka,
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

// ---------------------------------------------------------------------------
// Routed runs (auto-routing & auto-comparison) — see migration 023
// ---------------------------------------------------------------------------

export interface RoutedRunModelInput {
  modelSlug: string
  routeRank: number
  weightedScore: number | null
  factorScores: Record<string, number> | null
  role: 'primary' | 'candidate' | 'challenger'
  responseHash: string | null
  estCost: number | null
  estCo2g: number | null
  latencyMs: number | null
  isError: boolean
  errorReason: string | null
}

/** Insert a routed-run header row and return its UUID. */
export async function createRoutedRun(
  taskId: string,
  userId: string,
  mode: 'route' | 'trio' | 'challenger',
  promptHash: string,
): Promise<string> {
  const rows = await getDb()`
    INSERT INTO routed_runs (task_id, user_id, mode, prompt_hash)
    VALUES (${taskId}, ${userId}, ${mode}, ${promptHash})
    RETURNING id
  `
  return rows[0].id as string
}

/** Insert one per-model row for a routed run. */
export async function addRoutedRunModel(
  routedRunId: string,
  m: RoutedRunModelInput,
): Promise<void> {
  await getDb()`
    INSERT INTO routed_run_models (
      routed_run_id, model_slug, route_rank, weighted_score, factor_scores,
      role, response_hash, est_cost, est_co2_g, latency_ms, is_error, error_reason
    ) VALUES (
      ${routedRunId}, ${m.modelSlug}, ${m.routeRank}, ${m.weightedScore},
      ${m.factorScores ? JSON.stringify(m.factorScores) : null},
      ${m.role}, ${m.responseHash}, ${m.estCost}, ${m.estCo2g},
      ${m.latencyMs}, ${m.isError}, ${m.errorReason}
    )
  `
}

/** Record the blind LLM judge's verdict on a routed run. */
export async function setRoutedRunVerdict(
  routedRunId: string,
  judgedWinner: string,
  judgeModel: string,
): Promise<void> {
  await getDb()`
    UPDATE routed_runs
    SET judged_winner = ${judgedWinner}, judge_model = ${judgeModel}
    WHERE id = ${routedRunId}
  `
}

/** Record the user's preference on a routed run. */
export async function setRoutedRunPreference(
  routedRunId: string,
  humanPreferred: string,
  reason: string | null,
): Promise<void> {
  await getDb()`
    UPDATE routed_runs
    SET human_preferred = ${humanPreferred}, preference_reason = ${reason}
    WHERE id = ${routedRunId}
  `
}

/** Fetch a routed run header by ID. Returns undefined if not found. */
export async function getRoutedRun(routedRunId: string) {
  const rows = await getDb()`
    SELECT * FROM routed_runs WHERE id = ${routedRunId}
  `
  return rows[0] ?? undefined
}

/**
 * Count a user's *successful* routed runs of a given mode created today (UTC),
 * for rate limiting. Only runs with at least one non-error model output count —
 * a run where every model errored shouldn't burn the user's daily allowance
 * (mirrors the `bothSucceeded` guard on comparisons).
 */
export async function getRoutedRunCountToday(
  userId: string,
  mode: 'route' | 'trio' | 'challenger',
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const rows = await getDb()`
    SELECT COUNT(DISTINCT r.id)::int AS count
    FROM routed_runs r
    JOIN routed_run_models m ON m.routed_run_id = r.id AND m.is_error = false
    WHERE r.user_id = ${userId}
      AND r.mode = ${mode}
      AND r.created_at >= ${today}::date
      AND r.created_at < (${today}::date + INTERVAL '1 day')
  `
  return (rows[0]?.count as number) ?? 0
}
