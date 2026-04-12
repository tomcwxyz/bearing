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
      'model_a_slug',
      'model_b_slug',
      'preferred',
      'preference_reason',
      'task_date',
    ]

    const csvRows = records.map((r) =>
      [
        esc(r.task_type),
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
        version: '1.0',
        exported_at: new Date().toISOString(),
        record_count: records.length,
        description: 'Head-to-head model comparison preference data from Bearing',
        licence: 'CC BY-NC 4.0',
        fields: {
          task_type: 'Primary task category',
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
