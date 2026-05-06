import { neon } from '@neondatabase/serverless'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export type Granularity = 'day' | 'week' | 'month'

// Return types for dashboard queries
export type UsageSummary = Awaited<ReturnType<typeof getUsageSummary>>
export type ActivityPoint = Awaited<ReturnType<typeof getActivityOverTime>>[number]
export type ModeCount = Awaited<ReturnType<typeof getModeBreakdown>>[number]
export type SignupPoint = Awaited<ReturnType<typeof getSignupsOverTime>>[number]
export type InsightsSummary = Awaited<ReturnType<typeof getInsightsSummary>>
export type TaskTypeCount = Awaited<ReturnType<typeof getTaskTypeDistribution>>[number]
export type LeaderboardEntry = Awaited<ReturnType<typeof getModelLeaderboard>>[number]
export type OutcomeBreakdown = Awaited<ReturnType<typeof getOutcomeBreakdown>>
export type CapabilityDemand = Awaited<ReturnType<typeof getCapabilityDemand>>

const VALID_GRANULARITIES = new Set<Granularity>(['day', 'week', 'month'])

/** Validate and normalise a granularity string; defaults to 'day'. */
export function formatGranularity(input: string): Granularity {
  if (VALID_GRANULARITIES.has(input as Granularity)) {
    return input as Granularity
  }
  return 'day'
}

// ---------------------------------------------------------------------------
// Usage summary
// ---------------------------------------------------------------------------

/** High-level counts: total tasks, users, selections, comparisons. */
export async function getUsageSummary() {
  const sql = getDb()
  const rows = await sql`
    SELECT
      (SELECT count(*) FROM tasks)       AS total_tasks,
      (SELECT count(*) FROM users)       AS total_users,
      (SELECT count(*) FROM selections)  AS total_selections,
      (SELECT count(*) FROM comparisons) AS total_comparisons
  `
  const row = rows[0]
  return {
    totalTasks: Number(row.total_tasks),
    totalUsers: Number(row.total_users),
    totalSelections: Number(row.total_selections),
    totalComparisons: Number(row.total_comparisons),
  }
}

// ---------------------------------------------------------------------------
// Activity over time
// ---------------------------------------------------------------------------

/** Tasks and selections per period (day / week / month). */
export async function getActivityOverTime(granularity: Granularity) {
  const sql = getDb()
  const rows = await sql`
    SELECT
      date_trunc(${granularity}, t.period) AS period,
      coalesce(t.task_count, 0)            AS tasks,
      coalesce(s.sel_count, 0)             AS selections
    FROM (
      SELECT date_trunc(${granularity}, created_at) AS period,
             count(*) AS task_count
      FROM tasks
      GROUP BY 1
    ) t
    LEFT JOIN (
      SELECT date_trunc(${granularity}, created_at) AS period,
             count(*) AS sel_count
      FROM selections
      GROUP BY 1
    ) s ON s.period = t.period
    ORDER BY period
  `
  return rows.map((r) => ({
    period: r.period as string,
    tasks: Number(r.tasks),
    selections: Number(r.selections),
  }))
}

// ---------------------------------------------------------------------------
// Mode breakdown
// ---------------------------------------------------------------------------

/** Count of tasks per mode (recommend, validate, compare). */
export async function getModeBreakdown() {
  const sql = getDb()
  const rows = await sql`
    SELECT mode, count(*) AS count
    FROM tasks
    GROUP BY mode
    ORDER BY count DESC
  `
  return rows.map((r) => ({
    mode: r.mode as string,
    count: Number(r.count),
  }))
}

// ---------------------------------------------------------------------------
// Signups over time
// ---------------------------------------------------------------------------

/** User signups per period. */
export async function getSignupsOverTime(granularity: Granularity) {
  const sql = getDb()
  const rows = await sql`
    SELECT date_trunc(${granularity}, created_at) AS period,
           count(*) AS signups
    FROM users
    GROUP BY 1
    ORDER BY period
  `
  return rows.map((r) => ({
    period: r.period as string,
    signups: Number(r.signups),
  }))
}

// ---------------------------------------------------------------------------
// Insights summary
// ---------------------------------------------------------------------------

/** Aggregate insight metrics: success rate, avg selected rank, top task type, top model. */
export async function getInsightsSummary() {
  const sql = getDb()

  // Success rate from outcomes
  const outcomeRows = await sql`
    SELECT
      count(*) FILTER (WHERE success = true)  AS successes,
      count(*) FILTER (WHERE success = false) AS failures,
      count(*)                                AS total
    FROM outcomes
  `
  const oc = outcomeRows[0]
  const total = Number(oc.total)
  const successRate = total > 0 ? Number(oc.successes) / total : null

  // Average selected rank
  const rankRows = await sql`
    SELECT avg(recommended_rank) AS avg_rank
    FROM selections
    WHERE recommended_rank IS NOT NULL
  `
  const avgSelectedRank = rankRows[0].avg_rank != null
    ? Number(rankRows[0].avg_rank)
    : null

  // Top task type
  const taskTypeRows = await sql`
    SELECT task_type, count(*) AS count
    FROM tasks
    WHERE task_type IS NOT NULL
    GROUP BY task_type
    ORDER BY count DESC
    LIMIT 1
  `
  const topTaskType = taskTypeRows.length > 0
    ? (taskTypeRows[0].task_type as string)
    : null

  // Top model (most selected)
  const modelRows = await sql`
    SELECT s.model_slug, m.name, count(*) AS count
    FROM selections s
    LEFT JOIN models m ON m.slug = s.model_slug
    GROUP BY s.model_slug, m.name
    ORDER BY count DESC
    LIMIT 1
  `
  const topModel = modelRows.length > 0
    ? { slug: modelRows[0].model_slug as string, name: modelRows[0].name as string }
    : null

  return { successRate, avgSelectedRank, topTaskType, topModel }
}

// ---------------------------------------------------------------------------
// Task type distribution
// ---------------------------------------------------------------------------

/** Count of tasks per task_type. */
export async function getTaskTypeDistribution() {
  const sql = getDb()
  const rows = await sql`
    SELECT task_type, count(*) AS count
    FROM tasks
    WHERE task_type IS NOT NULL
    GROUP BY task_type
    ORDER BY count DESC
  `
  return rows.map((r) => ({
    taskType: r.task_type as string,
    count: Number(r.count),
  }))
}

// ---------------------------------------------------------------------------
// Model leaderboard
// ---------------------------------------------------------------------------

/** Per-model stats: times recommended, times selected, selection rate, avg rank. */
export async function getModelLeaderboard() {
  const sql = getDb()
  const rows = await sql`
    SELECT
      m.slug,
      m.name,
      coalesce(rec.recommended, 0) AS times_recommended,
      coalesce(sel.selected, 0)    AS times_selected,
      sel.avg_rank
    FROM models m
    LEFT JOIN (
      SELECT model_slug, count(*) AS recommended
      FROM recommendations
      GROUP BY model_slug
    ) rec ON rec.model_slug = m.slug
    LEFT JOIN (
      SELECT model_slug,
             count(*) AS selected,
             avg(recommended_rank) AS avg_rank
      FROM selections
      GROUP BY model_slug
    ) sel ON sel.model_slug = m.slug
    WHERE m.active = true
    ORDER BY coalesce(sel.selected, 0) DESC, coalesce(rec.recommended, 0) DESC
  `
  return rows.map((r) => {
    const recommended = Number(r.times_recommended)
    const selected = Number(r.times_selected)
    return {
      slug: r.slug as string,
      name: r.name as string,
      timesRecommended: recommended,
      timesSelected: selected,
      selectionRate: recommended > 0 ? selected / recommended : 0,
      avgRank: r.avg_rank != null ? Number(r.avg_rank) : null,
    }
  })
}

// ---------------------------------------------------------------------------
// Outcome breakdown
// ---------------------------------------------------------------------------

/** Success / failure counts with failure reason breakdown. */
export async function getOutcomeBreakdown() {
  const sql = getDb()

  const summaryRows = await sql`
    SELECT
      count(*) FILTER (WHERE success = true)  AS successes,
      count(*) FILTER (WHERE success = false) AS failures
    FROM outcomes
  `
  const summary = summaryRows[0]

  const reasonRows = await sql`
    SELECT failure_reason, count(*) AS count
    FROM outcomes
    WHERE success = false AND failure_reason IS NOT NULL
    GROUP BY failure_reason
    ORDER BY count DESC
  `

  return {
    successes: Number(summary.successes),
    failures: Number(summary.failures),
    failureReasons: reasonRows.map((r) => ({
      reason: r.failure_reason as string,
      count: Number(r.count),
    })),
  }
}

// ---------------------------------------------------------------------------
// Capability demand
// ---------------------------------------------------------------------------

/** Count of tasks requiring vision, tools, code, or reasoning capabilities. */
export async function getCapabilityDemand() {
  const sql = getDb()
  const rows = await sql`
    SELECT
      count(*) FILTER (WHERE needs_vision = true)    AS vision,
      count(*) FILTER (WHERE needs_tools = true)     AS tools,
      count(*) FILTER (WHERE needs_code = true)      AS code,
      count(*) FILTER (WHERE needs_reasoning = true) AS reasoning
    FROM tasks
  `
  const row = rows[0]
  return {
    vision: Number(row.vision),
    tools: Number(row.tools),
    code: Number(row.code),
    reasoning: Number(row.reasoning),
  }
}
