// EcoLogits inference-efficiency ingest.
//
// Calls the EcoLogits public REST API (api.ecologits.ai/v1beta/estimations)
// for each covered Bearing model using a canonical 300-output-token request.
// Stores GWP midpoints (kgCO2eq) in benchmark_snapshots with lowerIsBetter=true
// so the cohort-normalised score maps 0→worst, 1→best efficiency.
//
// Coverage: ~7 chat models initially (Anthropic, OpenAI, Google).
// Models not found in EcoLogits log a warning and are skipped.
// Uncovered models retain their curated inference_energy value.
//
// Usage:
//   npx tsx scripts/ingest-ecologits.ts            # dry-run (default)
//   npx tsx scripts/ingest-ecologits.ts --apply    # commit to DB

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { ingestSnapshot, upsertAlias, type SnapshotRow } from '../src/lib/benchmarks'

const apply = process.argv.includes('--apply')

const CANONICAL_OUTPUT_TOKENS = 300
const SNAPSHOT_DATE = '2026-05-29'
const ECOLOGITS_API = 'https://api.ecologits.ai/v1beta/estimations'

interface EcoLogitsSeed {
  bearingSlug: string
  ecoLogitsProvider: string
  ecoLogitsModelName: string
}

// Mapping confirmed via GET /v1beta/models/{provider} on 2026-05-29.
const SEEDS: EcoLogitsSeed[] = [
  // Anthropic
  { bearingSlug: 'claude-haiku-4.5',  ecoLogitsProvider: 'anthropic',    ecoLogitsModelName: 'claude-haiku-4-5-20251001' },
  { bearingSlug: 'claude-sonnet-4.6', ecoLogitsProvider: 'anthropic',    ecoLogitsModelName: 'claude-sonnet-4-6' },
  { bearingSlug: 'claude-opus-4.6',   ecoLogitsProvider: 'anthropic',    ecoLogitsModelName: 'claude-opus-4-6' },
  // OpenAI
  { bearingSlug: 'gpt-5.4',          ecoLogitsProvider: 'openai',       ecoLogitsModelName: 'gpt-5.4' },
  { bearingSlug: 'gpt-5.4-mini',     ecoLogitsProvider: 'openai',       ecoLogitsModelName: 'gpt-5.4-mini' },
  // Google
  { bearingSlug: 'gemini-3-flash',   ecoLogitsProvider: 'google_genai', ecoLogitsModelName: 'gemini-3-flash-preview' },
  { bearingSlug: 'gemini-3.1-pro',   ecoLogitsProvider: 'google_genai', ecoLogitsModelName: 'gemini-3.1-pro-preview' },
]

interface EstimationResponse {
  impacts: {
    gwp: { value: { min: number; max: number }; unit: string }
    warnings?: Array<{ code: string; message: string }>
    errors?: null | string
  }
}

async function fetchGwp(provider: string, modelName: string): Promise<{ gwpMidpoint: number; warnings: string[] } | null> {
  const res = await fetch(ECOLOGITS_API, {
    signal: AbortSignal.timeout(10_000),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      model_name: modelName,
      output_token_count: CANONICAL_OUTPUT_TOKENS,
      electricity_mix_zone: 'WOR',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.warn(`  ⚠ API error for ${provider}/${modelName}: ${res.status} ${text.slice(0, 200)}`)
    return null
  }

  const data: EstimationResponse = await res.json()
  if (data.impacts.errors) {
    console.warn(`  ⚠ Body-level error for ${provider}/${modelName}: ${data.impacts.errors}`)
    return null
  }
  const { min, max } = data.impacts.gwp.value
  return {
    gwpMidpoint: (min + max) / 2,
    warnings: (data.impacts.warnings ?? []).map(w => w.code),
  }
}

async function run() {
  console.log(`EcoLogits ingest — ${apply ? 'APPLY' : 'DRY RUN'} — ${SNAPSHOT_DATE}`)
  console.log(`Canonical request: output_token_count=${CANONICAL_OUTPUT_TOKENS}, zone=WOR\n`)

  const rows: SnapshotRow[] = []
  const skipped: string[] = []

  for (const seed of SEEDS) {
    process.stdout.write(`  ${seed.bearingSlug} (${seed.ecoLogitsProvider}/${seed.ecoLogitsModelName}) … `)
    const result = await fetchGwp(seed.ecoLogitsProvider, seed.ecoLogitsModelName)

    if (!result) {
      skipped.push(seed.bearingSlug)
      continue
    }

    const warningStr = result.warnings.length > 0 ? ` [${result.warnings.join(', ')}]` : ''
    console.log(`GWP midpoint: ${(result.gwpMidpoint * 1000).toFixed(4)} gCO2eq${warningStr}`)

    rows.push({
      source: 'ecologits',
      sourceCategory: 'inference_efficiency',
      sourceModelName: seed.ecoLogitsModelName,
      rawScore: result.gwpMidpoint,
      voteCount: null,
      snapshotDate: SNAPSHOT_DATE,
      lowerIsBetter: true,
    })
  }

  console.log(`\nFetched: ${rows.length} models | Skipped: ${skipped.length}`)
  if (skipped.length > 0) console.log(`Skipped: ${skipped.join(', ')}`)

  // Display normalised scores locally for verification
  if (rows.length > 0) {
    const min = Math.min(...rows.map(r => r.rawScore))
    const max = Math.max(...rows.map(r => r.rawScore))
    console.log('\nNormalised scores (lower GWP → higher score):')
    for (const row of rows) {
      const norm = max > min ? 1 - (row.rawScore - min) / (max - min) : 1.0
      const seed = SEEDS.find(s => s.ecoLogitsModelName === row.sourceModelName)!
      console.log(`  ${seed.bearingSlug.padEnd(25)} raw=${(row.rawScore * 1000).toFixed(4)}g  norm=${norm.toFixed(3)}`)
    }
  }

  if (!apply) {
    console.log('\nDry run — no changes written. Pass --apply to commit.')
    return
  }

  console.log('\nUpserting aliases…')
  for (const seed of SEEDS) {
    if (!rows.find(r => r.sourceModelName === seed.ecoLogitsModelName)) continue
    await upsertAlias('ecologits', seed.ecoLogitsModelName, seed.bearingSlug)
    console.log(`  aliased: ${seed.ecoLogitsModelName} → ${seed.bearingSlug}`)
  }

  console.log('\nInserting benchmark_snapshots…')
  const { inserted, unmatched } = await ingestSnapshot(rows)
  console.log(`Inserted: ${inserted} rows`)
  if (unmatched.length > 0) console.log(`Unmatched (no alias): ${unmatched.join(', ')}`)
}

run().catch(err => {
  console.error('Ingest failed:', err)
  process.exit(1)
})
