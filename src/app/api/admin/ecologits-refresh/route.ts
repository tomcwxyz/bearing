import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { fetchEcoLogitsScore, ECOLOGITS_PROVIDER_MAP } from '@/lib/ecologits-grounding'
import { ingestSnapshot, upsertAlias } from '@/lib/benchmarks'
import type { SnapshotRow } from '@/lib/benchmarks'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

// Protected by CRON_SECRET. Vercel sends this automatically for cron jobs.
// Can also be called manually: curl -H "Authorization: Bearer $CRON_SECRET" https://yoursite.com/api/admin/ecologits-refresh
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = getDb()

  const rows = await sql`
    SELECT slug, provider FROM models
    WHERE active = true AND model_class = 'chat'
    ORDER BY provider, slug
  `

  const results = {
    updated: [] as string[],
    skippedNoProvider: [] as string[],
    skippedNoMatch: [] as string[],
    failed: [] as string[],
  }

  // Phase 1: collect all GWP values without storing.
  // Passing storeInDb: false means each model is resolved and its GWP fetched
  // but no snapshot is written yet — so normalisation happens over the full
  // cohort in Phase 2 rather than per-model (which collapses to 0.0 for
  // lowerIsBetter when only one row is in the batch).
  type Resolved = { slug: string; ecoProvider: string; ecoModelName: string; rawGwp: number }
  const resolved: Resolved[] = []

  for (const row of rows) {
    const slug = row.slug as string
    const provider = row.provider as string

    if (!ECOLOGITS_PROVIDER_MAP[provider]) {
      results.skippedNoProvider.push(slug)
      continue
    }

    try {
      const score = await fetchEcoLogitsScore(slug, provider, { storeInDb: false })
      if (score) {
        resolved.push({ slug, ecoProvider: score.ecoProvider, ecoModelName: score.ecoModelName, rawGwp: score.rawGwp })
        results.updated.push(slug)
      } else {
        results.skippedNoMatch.push(slug)
      }
    } catch {
      results.failed.push(slug)
    }
  }

  // Phase 2: upsert aliases and batch-ingest all rows together.
  // ingestSnapshot normalises within the batch — passing all rows at once
  // ensures correct cohort-wide min-max scaling.
  if (resolved.length > 0) {
    const snapshotDate = new Date().toISOString().split('T')[0]
    for (const r of resolved) {
      await upsertAlias('ecologits', r.ecoModelName, r.slug)
    }
    const snapshotRows: SnapshotRow[] = resolved.map(r => ({
      source: 'ecologits' as const,
      sourceCategory: 'inference_efficiency',
      sourceModelName: r.ecoModelName,
      rawScore: r.rawGwp,
      voteCount: null,
      snapshotDate,
      lowerIsBetter: true,
      signalType: 'sustainability' as const,
    }))
    await ingestSnapshot(snapshotRows)
  }

  return NextResponse.json({
    ok: true,
    summary: {
      updated: results.updated.length,
      skippedNoProvider: results.skippedNoProvider.length,
      skippedNoMatch: results.skippedNoMatch.length,
      failed: results.failed.length,
    },
    details: results,
    timestamp: new Date().toISOString(),
  })
}
