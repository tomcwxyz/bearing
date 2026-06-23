// EcoLogits inference-efficiency ingest core.
//
// For each active chat model, resolves the EcoLogits alias and fetches the GWP
// midpoint, storing an absolute-curve efficiency score in benchmark_snapshots.
// Because the score comes from the cohort-independent gwpToScore() curve, each
// model is stored independently — no batch normalisation step.
//
// This is the single source of truth for the loop that was previously inlined in
// the cron route (/api/admin/ecologits-refresh). Both the cron route and the
// admin "Re-fetch" server action call it.

import { neon } from '@neondatabase/serverless'
import { fetchEcoLogitsScore, ECOLOGITS_PROVIDER_MAP } from '../ecologits-grounding'
import { noopLog, type IngestOptions, type EcoLogitsIngestResult } from './types'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

/**
 * Re-fetch EcoLogits GWP for every active chat model and upsert efficiency
 * snapshots. `fetchEcoLogitsScore(..., { storeInDb: true })` resolves the alias
 * and writes the snapshot in one call, so the score is final per model.
 */
export async function ingestEcoLogits(opts: IngestOptions = {}): Promise<EcoLogitsIngestResult> {
  const log = opts.log ?? noopLog
  const sql = getDb()

  const rows = await sql`
    SELECT slug, provider FROM models
    WHERE active = true AND model_class = 'chat'
    ORDER BY provider, slug
  `

  const updated: string[] = []
  const skippedNoProvider: string[] = []
  const skippedNoMatch: string[] = []
  const failed: string[] = []

  for (const row of rows) {
    const slug = row.slug as string
    const provider = row.provider as string

    if (!ECOLOGITS_PROVIDER_MAP[provider]) {
      skippedNoProvider.push(slug)
      continue
    }

    try {
      const score = await fetchEcoLogitsScore(slug, provider, { storeInDb: true })
      if (score) {
        updated.push(slug)
        log(`  ${slug} → ${score.ecoProvider}/${score.ecoModelName}  score=${score.normalisedScore.toFixed(3)}`)
      } else {
        skippedNoMatch.push(slug)
      }
    } catch (err) {
      failed.push(slug)
      log(`  ${slug} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const snapshotDate = new Date().toISOString().slice(0, 10)

  return {
    source: 'ecologits',
    fetched: rows.length,
    inserted: updated.length,
    // For EcoLogits, "unmatched" means no resolvable EcoLogits model name.
    unmatched: skippedNoMatch,
    snapshotDate,
    updated,
    skippedNoProvider,
    skippedNoMatch,
    failed,
  }
}
