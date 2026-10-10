import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { ingestArtificialAnalysis } from '@/lib/ingest/artificialanalysis'
import { ingestLmArenaSubset } from '@/lib/ingest/lmarena'
import { withLmArenaRun, LMARENA_SUBSETS } from '@/db/benchmark-refresh-runs'

// Vercel Cron sends Authorization: Bearer CRON_SECRET. The short-lived manual
// token is for an operator-triggered first refresh; never expose it to clients.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Source = 'lmarena-text' | 'lmarena-webdev' | 'lmarena-vision' | 'artificialanalysis'
const sources = new Set<Source>([...LMARENA_SUBSETS.map(s => `lmarena-${s}` as Source), 'artificialanalysis'])

function validBearer(header: string | null, token: string | undefined): boolean {
  if (!token || !header) return false
  const candidate = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(candidate)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ source: string }> },
) {
  const { source } = await params
  if (!sources.has(source as Source)) {
    return NextResponse.json({ error: 'Unknown benchmark source' }, { status: 404 })
  }
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  const header = request.headers.get('authorization')
  if (!validBearer(header, process.env.CRON_SECRET) &&
      !validBearer(header, process.env.BENCHMARK_REFRESH_MANUAL_TOKEN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const started = Date.now()
    const result = source.startsWith('lmarena-')
      ? await withLmArenaRun(source.slice('lmarena-'.length) as typeof LMARENA_SUBSETS[number], () =>
          ingestLmArenaSubset(source.slice('lmarena-'.length) as typeof LMARENA_SUBSETS[number]))
      : await ingestArtificialAnalysis()

    if (result.fetched === 0 || result.inserted === 0) {
      throw new Error('Source returned no ingestible benchmark rows')
    }

    // A successful fetch can contain source-published *old* snapshot dates.
    // Report ingestion time separately from data vintage.
    const summary = {
      source,
      rowsFetched: result.fetched,
      rowsUpserted: result.inserted,
      autoMatched: result.autoMatched.length,
      unmatchedModels: result.unmatched.length,
      sourceSnapshotDate: result.snapshotDate,
      completedAt: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - started) / 1000),
      duplicatesRemoved: result.duplicatesRemoved ?? 0,
      conflictingKeys: result.conflictingKeys ?? 0,
    }
    console.info('[benchmark-refresh] complete', JSON.stringify(summary))
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown refresh error'
    console.error('[benchmark-refresh] failed', source, message)
    return NextResponse.json({
      ok: false, source, error: message, completedAt: new Date().toISOString(),
    }, { status: 500 })
  }
}
