import { neon } from '@neondatabase/serverless'
import type { SourceBenchmarkName } from '@/lib/discover-coverage'

/** One grouped DB read covers every Discover model and every source candidate. */
export async function getDiscoverBenchmarkNames(): Promise<SourceBenchmarkName[]> {
  if (!process.env.NEON_DATABASE_URL) return []
  const sql = neon(process.env.NEON_DATABASE_URL)
  const rows = await sql`
    SELECT source, source_model_name,
      MAX(snapshot_date)::text AS latest_snapshot,
      MAX(captured_at)::text AS last_captured_at,
      COUNT(DISTINCT source_category)::int AS quality_categories
    FROM benchmark_snapshots
    WHERE source IN ('lmarena', 'artificialanalysis')
      AND (signal_type = 'task' OR signal_type IS NULL)
    GROUP BY source, source_model_name
  `
  return rows.map(r => ({
    source: r.source as SourceBenchmarkName['source'],
    sourceModelName: r.source_model_name as string,
    latestSnapshot: r.latest_snapshot as string | null,
    lastCapturedAt: r.last_captured_at as string | null,
    qualityCategories: Number(r.quality_categories),
  }))
}
