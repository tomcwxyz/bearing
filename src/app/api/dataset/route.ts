import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format') || 'json'

  const sql = getDb()

  // Fetch recommendations for completed tasks (those with a selection)
  const recs = await sql`
    SELECT
      r.task_id,
      r.model_slug,
      r.rank,
      r.weighted_score
    FROM recommendations r
    INNER JOIN selections s ON s.task_id = r.task_id
    ORDER BY r.task_id, r.rank
  `

  // Group recommendations by task_id
  const recsByTask = new Map<string, { slug: string; rank: number; weighted_score: number }[]>()
  for (const r of recs) {
    const taskId = r.task_id as string
    if (!recsByTask.has(taskId)) recsByTask.set(taskId, [])
    recsByTask.get(taskId)!.push({
      slug: r.model_slug as string,
      rank: r.rank as number,
      weighted_score: r.weighted_score as number,
    })
  }

  // Main query: tasks with selections, optionally joined to outcomes
  const rowsWithId = await sql`
    SELECT
      t.id AS task_id,
      t.task_type,
      t.task_subtype,
      t.complexity,
      t.input_length,
      t.needs_vision,
      t.needs_tools,
      t.needs_code,
      t.needs_reasoning,
      t.is_recurring,
      t.priority_order,
      t.classification_schema_version,
      t.created_at::date AS task_date,
      s.model_slug  AS selected_model,
      s.recommended_rank,
      o.success     AS outcome_success,
      o.failure_reason
    FROM tasks t
    INNER JOIN selections s ON s.task_id = t.id
    LEFT  JOIN outcomes  o ON o.task_id = t.id
    ORDER BY t.created_at DESC
  `

  const records = rowsWithId.map((row) => ({
    task_type: row.task_type,
    task_subtype: row.task_subtype,
    complexity: row.complexity,
    input_length: row.input_length,
    needs_vision: row.needs_vision,
    needs_tools: row.needs_tools,
    needs_code: row.needs_code,
    needs_reasoning: row.needs_reasoning,
    is_recurring: row.is_recurring,
    priority_order: row.priority_order,
    classification_schema_version: row.classification_schema_version,
    models_recommended: recsByTask.get(row.task_id as string) ?? [],
    model_selected: {
      slug: row.selected_model,
      recommended_rank: row.recommended_rank,
    },
    outcome_success: row.outcome_success ?? null,
    failure_reason: row.failure_reason ?? null,
    task_date: row.task_date,
  }))

  const headers = {
    'Cache-Control': 'public, max-age=3600',
  }

  if (format === 'csv') {
    const csvHeaders = [
      'task_type',
      'task_subtype',
      'complexity',
      'input_length',
      'needs_vision',
      'needs_tools',
      'needs_code',
      'needs_reasoning',
      'is_recurring',
      'priority_order',
      'classification_schema_version',
      'models_recommended',
      'selected_model',
      'selected_recommended_rank',
      'outcome_success',
      'failure_reason',
      'task_date',
    ]

    const csvRows = records.map((r) =>
      [
        esc(r.task_type),
        esc(r.task_subtype),
        esc(r.complexity),
        esc(r.input_length),
        r.needs_vision,
        r.needs_tools,
        r.needs_code,
        r.needs_reasoning,
        r.is_recurring,
        esc(JSON.stringify(r.priority_order)),
        esc(r.classification_schema_version),
        esc(JSON.stringify(r.models_recommended)),
        esc(r.model_selected.slug),
        r.model_selected.recommended_rank,
        r.outcome_success,
        esc(r.failure_reason),
        esc(r.task_date),
      ].join(','),
    )

    const csv = [csvHeaders.join(','), ...csvRows].join('\n')

    return new NextResponse(csv, {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bearing-dataset.csv"',
      },
    })
  }

  return NextResponse.json(
    {
      meta: {
        name: 'Bearing Public Dataset',
        version: '1.1',
        exported_at: new Date().toISOString(),
        record_count: records.length,
        description: 'Anonymised task-to-model selection data from Bearing',
        licence: 'CC BY-NC 4.0',
        // Each record carries the classification_schema_version under which
        // task_type was assigned. Filter or interpret accordingly.
        classification_schema_versions: {
          'v0.7': {
            task_types: ['summarise', 'extract', 'generate', 'code', 'analyse', 'translate', 'conversation', 'vision', 'other'],
            note: 'Used for all tasks classified before 2026-05-19.',
          },
          'v0.8': {
            task_types: ['summarise', 'extract', 'generate', 'comms', 'code', 'math', 'reasoning', 'analyse', 'research', 'qa', 'translate', 'conversation'],
            note: 'Used for tasks classified on or after 2026-05-19. Removed `vision` (now a capability only) and `other` (replaced by clarification flow). Added `comms`, `math`, `reasoning`, `research`, `qa`.',
          },
        },
        fields: {
          task_type: 'Primary task category (see classification_schema_versions for the valid set per row)',
          task_subtype: 'More specific task category',
          complexity: 'Estimated complexity: low, medium, high',
          input_length: 'Estimated input length: short, medium, long, very_long',
          needs_vision: 'Whether the task requires vision/image capabilities',
          needs_tools: 'Whether the task requires tool use / function calling',
          needs_code: 'Whether the task requires code generation or execution',
          needs_reasoning: 'Whether the task requires multi-step reasoning / extended thinking',
          is_recurring: 'Whether this is a recurring/repeated task',
          priority_order: 'User-ranked priority factors in order of importance',
          classification_schema_version: 'Which version of the task-type enum was used to assign task_type — v0.7 or v0.8',
          models_recommended: 'Array of {slug, rank, weighted_score} for each recommended model',
          model_selected: '{slug, recommended_rank} of the model the user chose',
          outcome_success: 'Whether the user reported success (true/false/null)',
          failure_reason: 'User-reported failure reason if applicable',
          task_date: 'Date the task was created',
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
