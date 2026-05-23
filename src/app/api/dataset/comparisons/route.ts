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

  const rows = await sql`
    SELECT
      t.task_type,
      t.classification_schema_version,
      c.model_a_slug,
      c.model_b_slug,
      c.preferred,
      c.preference_reason,
      c.created_at::date AS task_date
    FROM comparisons c
    INNER JOIN tasks t ON t.id = c.task_id
    WHERE c.preferred IS NOT NULL
    ORDER BY c.created_at DESC
  `

  const records = rows.map((row) => ({
    task_type: row.task_type,
    classification_schema_version: row.classification_schema_version,
    model_a_slug: row.model_a_slug,
    model_b_slug: row.model_b_slug,
    preferred: row.preferred,
    preference_reason: row.preference_reason ?? null,
    task_date: row.task_date,
  }))

  const headers = {
    'Cache-Control': 'public, max-age=3600',
  }

  if (format === 'csv') {
    const csvHeaders = [
      'task_type',
      'classification_schema_version',
      'model_a_slug',
      'model_b_slug',
      'preferred',
      'preference_reason',
      'task_date',
    ]

    const csvRows = records.map((r) =>
      [
        esc(r.task_type),
        esc(r.classification_schema_version),
        esc(r.model_a_slug),
        esc(r.model_b_slug),
        esc(r.preferred),
        esc(r.preference_reason),
        esc(r.task_date),
      ].join(','),
    )

    const csv = [csvHeaders.join(','), ...csvRows].join('\n')

    return new NextResponse(csv, {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bearing-comparisons.csv"',
      },
    })
  }

  return NextResponse.json(
    {
      meta: {
        name: 'Bearing Comparison Dataset',
        version: '1.1',
        exported_at: new Date().toISOString(),
        record_count: records.length,
        description: 'Head-to-head model comparison preference data from Bearing',
        licence: 'CC BY-NC 4.0',
        classification_schema_versions: {
          'v0.7': {
            task_types: ['summarise', 'extract', 'generate', 'code', 'analyse', 'translate', 'conversation', 'vision', 'other'],
            note: 'Used for comparisons run before 2026-05-19.',
          },
          'v0.8': {
            task_types: ['summarise', 'extract', 'generate', 'comms', 'code', 'math', 'reasoning', 'analyse', 'research', 'qa', 'translate', 'conversation'],
            note: 'Used for comparisons run on or after 2026-05-19. Removed `vision` and `other`; added `comms`, `math`, `reasoning`, `research`, `qa`.',
          },
        },
        fields: {
          task_type: 'Primary task category (see classification_schema_versions for the valid set per row)',
          classification_schema_version: 'Which version of the task-type enum was used to assign task_type — v0.7 or v0.8',
          model_a_slug: 'First model in the comparison',
          model_b_slug: 'Second model in the comparison',
          preferred: 'Which model was preferred: model_a, model_b, or tie',
          preference_reason: 'User-provided reason for preference',
          task_date: 'Date the comparison was made',
        },
      },
      records,
    },
    { headers },
  )
}

function esc(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}
