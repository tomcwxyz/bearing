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
      t.classification_schema_version
    FROM routed_runs r
    INNER JOIN tasks t ON t.id = r.task_id
    ORDER BY r.created_at DESC
  `

  const modelRows = await sql`
    SELECT routed_run_id, model_slug, route_rank, weighted_score, role, is_error
    FROM routed_run_models
    ORDER BY routed_run_id, route_rank
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
    })
  }

  const records = runs.map((row) => ({
    mode: row.mode,
    task_type: row.task_type,
    complexity: row.complexity,
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
      'mode', 'task_type', 'complexity', 'classification_schema_version',
      'candidates', 'judged_winner', 'judge_model', 'human_preferred',
      'preference_reason', 'run_date',
    ]
    const csvRows = records.map((r) =>
      [
        esc(r.mode),
        esc(r.task_type),
        esc(r.complexity),
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
        version: '1.0',
        exported_at: new Date().toISOString(),
        record_count: records.length,
        description:
          'Auto-routing and auto-comparison (Trio/Challenger) data from Bearing. One row per routed run: the candidate models the recommender routed to, the blind judge verdict, and the human preference. Prompts and responses are never stored — only hashes.',
        licence: 'CC BY-NC 4.0',
        fields: {
          mode: 'Routing mode: "route" (single best model), "trio" (top 3, blind-judged), or "challenger" (top model then a reviewer)',
          task_type: 'Primary task category for the underlying task',
          complexity: 'Estimated task complexity',
          classification_schema_version: 'Task-type enum version used to classify the task',
          candidates: 'Array of {model_slug, route_rank, weighted_score, role, is_error}. route_rank 1 = top-ranked; role is "primary" | "candidate" | "challenger".',
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
