import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export type RoutedRunMode = 'route' | 'trio' | 'challenger'

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

export async function createRoutedRun(
  taskId: string,
  userId: string,
  mode: RoutedRunMode,
  promptHash: string,
): Promise<string> {
  const rows = await getDb()`
    INSERT INTO routed_runs (task_id, user_id, mode, prompt_hash)
    VALUES (${taskId}, ${userId}, ${mode}, ${promptHash})
    RETURNING id
  `
  return rows[0].id as string
}

export async function addRoutedRunModel(
  routedRunId: string,
  model: RoutedRunModelInput,
): Promise<void> {
  await getDb()`
    INSERT INTO routed_run_models (
      routed_run_id, model_slug, route_rank, weighted_score, factor_scores,
      role, response_hash, est_cost, est_co2_g, latency_ms, is_error, error_reason
    ) VALUES (
      ${routedRunId}, ${model.modelSlug}, ${model.routeRank}, ${model.weightedScore},
      ${model.factorScores ? JSON.stringify(model.factorScores) : null},
      ${model.role}, ${model.responseHash}, ${model.estCost}, ${model.estCo2g},
      ${model.latencyMs}, ${model.isError}, ${model.errorReason}
    )
  `
}

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

export async function getRoutedRun(routedRunId: string) {
  const rows = await getDb()`
    SELECT * FROM routed_runs WHERE id = ${routedRunId}
  `
  return rows[0] ?? undefined
}

export async function getRoutedRunCountToday(
  userId: string,
  mode: RoutedRunMode,
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
  return Number(rows[0]?.count ?? 0)
}
