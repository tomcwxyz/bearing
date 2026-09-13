import { neon } from '@neondatabase/serverless'
import {
  EMPTY_OUTCOME_COUNTS,
  summariseOutcomeEvidence,
  type ModelOutcomeEvidence,
  type OutcomeEvidenceCounts,
  type OutcomeEvidenceScope,
} from '@/lib/outcome-evidence'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

type AggregateRow = {
  model_slug: string
  scope: OutcomeEvidenceScope
  human_positive: number | string
  human_negative: number | string
  human_ties: number | string
  judge_positive: number | string
  judge_negative: number | string
}

function number(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function countsFromRow(row: AggregateRow): OutcomeEvidenceCounts {
  return {
    humanPositive: number(row.human_positive),
    humanNegative: number(row.human_negative),
    humanTies: number(row.human_ties),
    judgePositive: number(row.judge_positive),
    judgeNegative: number(row.judge_negative),
  }
}

function support(counts: OutcomeEvidenceCounts): number {
  return counts.humanPositive + counts.humanNegative + counts.humanTies +
    counts.judgePositive + counts.judgeNegative
}

/**
 * Aggregate outcome evidence for a recommendation set using only structured
 * task attributes. Raw prompts and responses are never read.
 *
 * Human evidence includes explicit success/failure outcomes plus manual,
 * Trio and Challenger preferences. Blind-judge choices are aggregated through
 * a separate channel. We prefer the tighter task_type+complexity cohort once
 * it has at least three observations; otherwise we fall back to task_type so
 * sparse early data remains visible without being mistaken for precision.
 */
export async function getOutcomeEvidenceForModels(input: {
  taskType: string
  complexity: string | null | undefined
  modelSlugs: string[]
}): Promise<Record<string, ModelOutcomeEvidence>> {
  if (input.modelSlugs.length === 0) return {}

  const complexity = input.complexity ?? 'unknown'
  const rows = await getDb()`
    WITH human_events AS (
      -- Explicit post-use success/failure feedback.
      SELECT
        s.model_slug,
        t.task_type,
        COALESCE(t.complexity, 'unknown') AS complexity,
        CASE WHEN o.success = true THEN 1 WHEN o.success = false THEN -1 ELSE 0 END AS signal
      FROM outcomes o
      JOIN selections s ON s.id = o.selection_id
      JOIN tasks t ON t.id = o.task_id
      WHERE o.success IS NOT NULL
        AND s.model_slug = ANY(${input.modelSlugs}::text[])

      UNION ALL

      -- Manual pairwise preferences. A tie contributes a neutral human signal
      -- to both models rather than inventing a winner.
      SELECT
        choice.model_slug,
        t.task_type,
        COALESCE(t.complexity, 'unknown') AS complexity,
        choice.signal
      FROM comparisons c
      JOIN tasks t ON t.id = c.task_id
      CROSS JOIN LATERAL (
        VALUES
          (
            c.model_a_slug,
            CASE c.preferred WHEN 'model_a' THEN 1 WHEN 'model_b' THEN -1 WHEN 'tie' THEN 0 ELSE NULL END
          ),
          (
            c.model_b_slug,
            CASE c.preferred WHEN 'model_b' THEN 1 WHEN 'model_a' THEN -1 WHEN 'tie' THEN 0 ELSE NULL END
          )
      ) AS choice(model_slug, signal)
      WHERE c.preferred IN ('model_a', 'model_b', 'tie')
        AND choice.signal IS NOT NULL
        AND choice.model_slug = ANY(${input.modelSlugs}::text[])

      UNION ALL

      -- Human preference after Trio / Challenger. Erroring candidates are not
      -- treated as quality losses; runtime reliability has its own evidence.
      SELECT
        m.model_slug,
        t.task_type,
        COALESCE(t.complexity, 'unknown') AS complexity,
        CASE
          WHEN r.human_preferred = 'tie' THEN 0
          WHEN r.human_preferred = m.model_slug THEN 1
          ELSE -1
        END AS signal
      FROM routed_runs r
      JOIN routed_run_models m ON m.routed_run_id = r.id
      JOIN tasks t ON t.id = r.task_id
      WHERE r.human_preferred IS NOT NULL
        AND COALESCE(m.is_error, false) = false
        AND m.model_slug = ANY(${input.modelSlugs}::text[])
    ),
    judge_events AS (
      -- Machine judge evidence stays deliberately separate from human signals.
      SELECT
        m.model_slug,
        t.task_type,
        COALESCE(t.complexity, 'unknown') AS complexity,
        CASE WHEN r.judged_winner = m.model_slug THEN 1 ELSE -1 END AS signal
      FROM routed_runs r
      JOIN routed_run_models m ON m.routed_run_id = r.id
      JOIN tasks t ON t.id = r.task_id
      WHERE r.judged_winner IS NOT NULL
        AND COALESCE(m.is_error, false) = false
        AND m.model_slug = ANY(${input.modelSlugs}::text[])
    ),
    events AS (
      SELECT model_slug, task_type, complexity, 'human'::text AS source, signal FROM human_events
      UNION ALL
      SELECT model_slug, task_type, complexity, 'judge'::text AS source, signal FROM judge_events
    ),
    scoped AS (
      SELECT model_slug, source, signal, 'task_type+complexity'::text AS scope
      FROM events
      WHERE task_type = ${input.taskType} AND complexity = ${complexity}

      UNION ALL

      SELECT model_slug, source, signal, 'task_type'::text AS scope
      FROM events
      WHERE task_type = ${input.taskType}
    )
    SELECT
      model_slug,
      scope,
      COUNT(*) FILTER (WHERE source = 'human' AND signal = 1)::int AS human_positive,
      COUNT(*) FILTER (WHERE source = 'human' AND signal = -1)::int AS human_negative,
      COUNT(*) FILTER (WHERE source = 'human' AND signal = 0)::int AS human_ties,
      COUNT(*) FILTER (WHERE source = 'judge' AND signal = 1)::int AS judge_positive,
      COUNT(*) FILTER (WHERE source = 'judge' AND signal = -1)::int AS judge_negative
    FROM scoped
    GROUP BY model_slug, scope
  ` as AggregateRow[]

  const bySlug = new Map<string, Partial<Record<OutcomeEvidenceScope, OutcomeEvidenceCounts>>>()
  for (const row of rows) {
    const current = bySlug.get(row.model_slug) ?? {}
    current[row.scope] = countsFromRow(row)
    bySlug.set(row.model_slug, current)
  }

  return Object.fromEntries(input.modelSlugs.map((slug) => {
    const scopes = bySlug.get(slug) ?? {}
    const exact = scopes['task_type+complexity'] ?? EMPTY_OUTCOME_COUNTS
    const broad = scopes.task_type ?? EMPTY_OUTCOME_COUNTS
    const chosenScope: OutcomeEvidenceScope = support(exact) >= 3
      ? 'task_type+complexity'
      : 'task_type'
    const chosenCounts = chosenScope === 'task_type+complexity' ? exact : broad

    return [slug, summariseOutcomeEvidence(chosenCounts, chosenScope)]
  }))
}
