import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

interface CandidateRow {
  model_slug: string
  route_rank: number
  weighted_score: number | null
  role: string
  is_error: boolean
  open_weights: number
  is_open_weight: boolean
  local_capable: boolean
  model_class: string
  execution_location: string | null
  execution_route: string | null
  runtime_model_id: string | null
}

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format') || 'json'
  const sql = getDb()

  // One row per routed run (single route, Trio, or Challenger). We join the
  // per-model rows so each record carries its full candidate set. Privacy: only
  // hashes are stored, so nothing here can reconstruct the prompt or responses.
  const runs = await sql`
    SELECT
      r.id,
      r.mode,
      r.judged_winner,
      r.judge_model,
      r.human_preferred,
      r.preference_reason,
      r.created_at::date AS run_date,
      t.task_type,
      t.complexity,
      t.data_sensitivity,
      t.latency_target,
      t.volume,
      t.needs_long_context,
      t.needs_multilingual,
      t.is_agentic,
      t.output_length,
      t.classification_schema_version
    FROM routed_runs r
    INNER JOIN tasks t ON t.id = r.task_id
    ORDER BY r.created_at DESC
  `

  const modelRows = await sql`
    SELECT
      rrm.routed_run_id,
      rrm.model_slug,
      rrm.route_rank,
      rrm.weighted_score,
      rrm.role,
      rrm.is_error,
      COALESCE((m.transparency->>'open_weights')::numeric, 0) AS open_weights,
      COALESCE((m.transparency->>'open_weights')::numeric, 0) >= 0.8 AS is_open_weight,
      m.local_info IS NOT NULL AS local_capable,
      COALESCE(m.model_class, 'chat') AS model_class,
      execution.execution_location,
      execution.runtime AS execution_route,
      execution.runtime_model_id
    FROM routed_run_models rrm
    LEFT JOIN models m ON m.slug = rrm.model_slug
    LEFT JOIN LATERAL (
      SELECT execution_location, runtime, runtime_model_id
      FROM execution_observations eo
      WHERE eo.routed_run_id = rrm.routed_run_id
        AND eo.model_slug = rrm.model_slug
        AND eo.execution_purpose = 'task_execution'
      ORDER BY eo.created_at DESC
      LIMIT 1
    ) execution ON true
    ORDER BY rrm.routed_run_id, rrm.route_rank
  `

  const candidatesByRun = new Map<string, CandidateRow[]>()
  for (const m of modelRows) {
    const id = m.routed_run_id as string
    if (!candidatesByRun.has(id)) candidatesByRun.set(id, [])
    candidatesByRun.get(id)!.push({
      model_slug: m.model_slug as string,
      route_rank: m.route_rank as number,
      weighted_score: (m.weighted_score as number | null) ?? null,
      role: m.role as string,
      is_error: m.is_error as boolean,
      open_weights: Number(m.open_weights ?? 0),
      is_open_weight: Boolean(m.is_open_weight),
      local_capable: Boolean(m.local_capable),
      model_class: String(m.model_class ?? 'chat'),
      execution_location: m.execution_location == null ? null : String(m.execution_location),
      execution_route: m.execution_route == null ? null : String(m.execution_route),
      runtime_model_id: m.runtime_model_id == null ? null : String(m.runtime_model_id),
    })
  }

  const records = runs.map((row) => ({
    mode: row.mode,
    task_type: row.task_type,
    complexity: row.complexity,
    data_sensitivity: row.data_sensitivity,
    latency_target: row.latency_target,
    volume: row.volume,
    needs_long_context: row.needs_long_context,
    needs_multilingual: row.needs_multilingual,
    is_agentic: row.is_agentic,
    output_length: row.output_length,
    execution_location: 'bearing_hosted',
    classification_schema_version: row.classification_schema_version,
    candidates: candidatesByRun.get(row.id as string) ?? [],
    judged_winner: row.judged_winner ?? null,
    judge_model: row.judge_model ?? null,
    human_preferred: row.human_preferred ?? null,
    preference_reason: row.preference_reason ?? null,
    run_date: row.run_date,
  }))

  const headers = { 'Cache-Control': 'public, max-age=3600' }

  if (format === 'csv') {
    const csvHeaders = [
      'mode', 'task_type', 'complexity', 'data_sensitivity', 'latency_target',
      'volume', 'needs_long_context', 'needs_multilingual', 'is_agentic',
      'output_length', 'execution_location', 'classification_schema_version',
      'candidates', 'judged_winner', 'judge_model', 'human_preferred',
      'preference_reason', 'run_date',
    ]
    const csvRows = records.map((r) =>
      [
        esc(r.mode),
        esc(r.task_type),
        esc(r.complexity),
        esc(r.data_sensitivity),
        esc(r.latency_target),
        esc(r.volume),
        r.needs_long_context,
        r.needs_multilingual,
        r.is_agentic,
        esc(r.output_length),
        esc(r.execution_location),
        esc(r.classification_schema_version),
        esc(JSON.stringify(r.candidates)),
        esc(r.judged_winner),
        esc(r.judge_model),
        esc(r.human_preferred),
        esc(r.preference_reason),
        esc(r.run_date),
      ].join(','),
    )
    const csv = [csvHeaders.join(','), ...csvRows].join('\n')
    return new NextResponse(csv, {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bearing-routed-runs.csv"',
      },
    })
  }

  return NextResponse.json(
    {
      meta: {
        name: 'Bearing Routed-Run Dataset',
        version: '1.2',
        exported_at: new Date().toISOString(),
        record_count: records.length,
        description:
          'Auto-routing and auto-comparison (Trio/Challenger) data from Bearing. One row per routed run: the candidate models the recommender routed to, the blind judge verdict, and the human preference. Prompts and responses are never stored — only hashes.',
        licence: 'CC BY-NC 4.0',
        fields: {
          mode: 'Routing mode: "route" (single best model), "trio" (top 3, blind-judged), or "challenger" (top model then a reviewer)',
          task_type: 'Primary task category for the underlying task',
          complexity: 'Estimated task complexity',
          data_sensitivity: 'Task data-sensitivity class used by routing',
          latency_target: 'Task latency target',
          volume: 'Expected task volume',
          needs_long_context: 'Whether the task requires long context',
          needs_multilingual: 'Whether the task requires multilingual capability',
          is_agentic: 'Whether the task is an agentic workload',
          output_length: 'Estimated output length',
          execution_location: 'All records in this dataset are Bearing-hosted provider executions',
          classification_schema_version: 'Task-type enum version used to classify the task',
          candidates: 'Array of {model_slug, route_rank, weighted_score, role, is_error, open_weights, is_open_weight, local_capable, model_class, execution_location, execution_route, runtime_model_id}. Route fields come from observed execution evidence when available; older runs may be null.',
          judged_winner: 'model_slug the blind LLM judge picked (trio/challenger); null for single routes or when judging was skipped',
          judge_model: 'The model that produced the verdict',
          human_preferred: 'model_slug the user preferred, or "tie"; null if the user did not say',
          preference_reason: 'User-provided reason for their preference, if any',
          run_date: 'Date the run was made',
        },
      },
      records,
    },
    { headers },
  )
}

/** Escape a value for CSV: wrap in quotes if it contains commas, quotes, or newlines. */
function esc(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}
