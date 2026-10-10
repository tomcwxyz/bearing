import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import type { IngestResult } from '@/lib/ingest/types'

function db() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export type RefreshSubset = 'text' | 'webdev' | 'vision'
export const LMARENA_SUBSETS: RefreshSubset[] = ['text', 'webdev', 'vision']

export interface RefreshRun {
  id: string
  source: string
  subset: string
  status: 'running' | 'succeeded' | 'failed' | 'interrupted'
  startedAt: string
  completedAt: string | null
  fetched: number | null
  inserted: number | null
  duplicatesRemoved: number | null
  conflictingKeys: number | null
  snapshotDate: string | null
  error: string | null
}

// The Vercel function may be killed without running catch/finally.
// A stale 'running' record is therefore reported as interrupted, not healthy.
export function effectiveRefreshStatus(
  status: string,
  startedAt: string,
  now = new Date(),
): RefreshRun['status'] {
  if (status !== 'running') return status as RefreshRun['status']
  return now.getTime() - new Date(startedAt).getTime() > 10 * 60_000
    ? 'interrupted' : 'running'
}

export async function latestLmArenaRuns(): Promise<RefreshRun[]> {
  const rows = await db()`
    SELECT DISTINCT ON (subset) *
    FROM benchmark_refresh_runs
    WHERE source = 'lmarena' AND subset IN ('text', 'webdev', 'vision')
    ORDER BY subset, started_at DESC
  `
  return rows.map(row => ({
    id: String(row.id),
    source: String(row.source),
    subset: String(row.subset),
    status: effectiveRefreshStatus(String(row.status), String(row.started_at)),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    fetched: row.fetched == null ? null : Number(row.fetched),
    inserted: row.inserted == null ? null : Number(row.inserted),
    duplicatesRemoved: row.duplicates_removed == null ? null : Number(row.duplicates_removed),
    conflictingKeys: row.conflicting_keys == null ? null : Number(row.conflicting_keys),
    snapshotDate: row.snapshot_date ? new Date(String(row.snapshot_date)).toISOString().slice(0, 10) : null,
    error: row.error ? String(row.error) : null,
  }))
}

/** Each subset has its own run record. Errors are persisted before being
 * rethrown, so both cron and admin action can signal a failure. */
export async function withLmArenaRun(
  subset: RefreshSubset,
  work: () => Promise<IngestResult>,
): Promise<IngestResult> {
  const id = randomUUID()
  const sql = db()
  await sql`
    INSERT INTO benchmark_refresh_runs (id, source, subset, status)
    VALUES (${id}, 'lmarena', ${subset}, 'running')
  `
  try {
    const result = await work()
    if (result.fetched <= 0 || result.inserted <= 0) {
      throw new Error('Subset returned no ingested rows')
    }
    await sql`
      UPDATE benchmark_refresh_runs SET
        status = 'succeeded', completed_at = now(),
        fetched = ${result.fetched}, inserted = ${result.inserted},
        duplicates_removed = ${result.duplicatesRemoved ?? 0},
        conflicting_keys = ${result.conflictingKeys ?? 0},
        snapshot_date = ${result.snapshotDate}::date
      WHERE id = ${id}
    `
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingest error'
    await sql`
      UPDATE benchmark_refresh_runs SET status = 'failed', completed_at = now(),
        error = ${message.slice(0, 1000)}
      WHERE id = ${id}
    `.catch(e => console.error('[lmarena-refresh] failed to persist error', e))
    throw error
  }
}
