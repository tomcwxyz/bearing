// EcoLogits inference-efficiency ingest.
//
// Calls the EcoLogits public REST API (api.ecologits.ai/v1beta/estimations)
// for each covered Bearing model using a canonical 300-output-token request.
// Stores GWP midpoints (kgCO2eq) in benchmark_snapshots with lowerIsBetter=true
// so the cohort-normalised score maps 0→worst, 1→best efficiency.
//
// Models are auto-discovered from the DB (active chat models) rather than a
// hardcoded seed list. Confirmed aliases in benchmark_aliases take priority;
// for the rest we attempt a fuzzy match against the EcoLogits model list.
//
// Usage:
//   npx tsx scripts/ingest-ecologits.ts            # dry-run (default)
//   npx tsx scripts/ingest-ecologits.ts --apply    # commit to DB

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { neon } from '@neondatabase/serverless'
import { ingestSnapshot, upsertAlias, type SnapshotRow } from '../src/lib/benchmarks'

const apply = process.argv.includes('--apply')

const CANONICAL_OUTPUT_TOKENS = 300
// Derive snapshot date from today rather than hardcoding.
const SNAPSHOT_DATE = new Date().toISOString().split('T')[0]
const ECOLOGITS_API = 'https://api.ecologits.ai/v1beta/estimations'

// Maps Bearing's `provider` field (from models table) to EcoLogits provider string.
// Only providers EcoLogits supports are listed. Others → skip.
const PROVIDER_MAP: Record<string, string> = {
  'Anthropic': 'anthropic',
  'OpenAI': 'openai',
  'Google': 'google_genai',
  'Mistral': 'mistralai',
  'Cohere': 'cohere',
  'Meta (via hosted providers)': 'huggingface_hub',
}

// Normalise for comparison: lowercase + dots→hyphens
function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\./g, '-')
}

// Match a Bearing slug to the best EcoLogits model name from the provider's list.
// Returns null if no confident match.
function resolveModelName(slug: string, ecoModels: string[]): string | null {
  const normSlug = normaliseName(slug)

  // 1. Exact match after normalisation
  for (const m of ecoModels) {
    if (normaliseName(m) === normSlug) return m
  }

  // 2. Bearing slug is a prefix of EcoLogits name (eco adds -preview, date suffix, etc.)
  //    e.g. 'gemini-3-flash' matches 'gemini-3-flash-preview'
  const prefixMatches = ecoModels.filter(m => normaliseName(m).startsWith(normSlug))
  if (prefixMatches.length === 1) return prefixMatches[0]
  if (prefixMatches.length > 1) {
    // Pick shortest name (fewest extra characters beyond the slug)
    return prefixMatches.sort((a, b) => a.length - b.length)[0]
  }

  // 3. EcoLogits name is a prefix of bearing slug — pick longest (most specific)
  const reverseMatches = ecoModels.filter(m => normSlug.startsWith(normaliseName(m)))
  if (reverseMatches.length > 0) {
    return reverseMatches.sort((a, b) => b.length - a.length)[0]
  }

  return null
}

// GET https://api.ecologits.ai/v1beta/models/{provider}
// Returns array of model name strings for that provider.
async function fetchEcoModelList(provider: string): Promise<string[]> {
  const res = await fetch(`https://api.ecologits.ai/v1beta/models/${provider}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    console.warn(`  ⚠ Could not fetch model list for provider '${provider}': ${res.status}`)
    return []
  }
  const data: { models: Array<{ name: string }> } = await res.json()
  return data.models.map(m => m.name)
}

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
  const gwpMidpoint = (min + max) / 2
  if (!isFinite(gwpMidpoint)) {
    console.warn(`  ⚠ Non-finite GWP for ${provider}/${modelName}: min=${min}, max=${max}`)
    return null
  }
  return {
    gwpMidpoint,
    warnings: (data.impacts.warnings ?? []).map(w => w.code),
  }
}

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

interface DbModel {
  slug: string
  provider: string
}

interface ResolvedModel {
  bearingSlug: string
  ecoProvider: string
  ecoModelName: string
  /** true = came from benchmark_aliases; false = auto-resolved */
  confirmed: boolean
}

async function run() {
  console.log(`EcoLogits ingest — ${apply ? 'APPLY' : 'DRY RUN'} — ${SNAPSHOT_DATE}`)
  console.log(`Canonical request: output_token_count=${CANONICAL_OUTPUT_TOKENS}, zone=WOR\n`)

  const sql = getDb()

  // 1. Query active chat models from DB.
  const modelRows = await sql`
    SELECT slug, provider FROM models WHERE active = true AND model_class = 'chat'
  ` as DbModel[]

  // 2. Load existing confirmed aliases (these take priority over auto-resolution).
  const aliasRows = await sql`
    SELECT source_model_name, bearing_slug FROM benchmark_aliases WHERE source = 'ecologits'
  ` as Array<{ source_model_name: string; bearing_slug: string }>

  // Build a reverse map: bearingSlug → { ecoModelName } for confirmed aliases.
  const confirmedBySlug = new Map<string, string>()
  for (const row of aliasRows) {
    confirmedBySlug.set(row.bearing_slug, row.source_model_name)
  }

  // 3. Resolve each model.  Cache EcoLogits model lists per provider.
  const ecoModelListCache = new Map<string, string[]>()

  const resolved: ResolvedModel[] = []
  const skippedNoProvider: string[] = []
  const skippedNoMatch: string[] = []

  for (const model of modelRows) {
    const { slug, provider } = model

    // Step A: confirmed alias takes priority.
    if (confirmedBySlug.has(slug)) {
      const ecoModelName = confirmedBySlug.get(slug)!
      // We need to figure out the provider from the model name.  Use PROVIDER_MAP as guide.
      const ecoProvider = PROVIDER_MAP[provider]
      if (!ecoProvider) {
        // Alias exists but provider isn't in EcoLogits — trust the alias, use
        // the confirmed ecoModelName and derive provider from the alias key.
        // We can't call the API without a provider, so we must have one.
        // Flag as skipped with a note.
        console.log(`  ${slug}  confirmed alias found but provider '${provider}' not in PROVIDER_MAP — skipping`)
        skippedNoProvider.push(slug)
        continue
      }
      resolved.push({ bearingSlug: slug, ecoProvider, ecoModelName, confirmed: true })
      console.log(`  ${slug}  confirmed alias → ${ecoProvider}/${ecoModelName}`)
      continue
    }

    // Step B: map Bearing provider to EcoLogits provider.
    const ecoProvider = PROVIDER_MAP[provider]
    if (!ecoProvider) {
      console.log(`  ${slug}  no EcoLogits provider for '${provider}' — skipped`)
      skippedNoProvider.push(slug)
      continue
    }

    // Step C: fetch EcoLogits model list for that provider (cached).
    if (!ecoModelListCache.has(ecoProvider)) {
      const list = await fetchEcoModelList(ecoProvider)
      ecoModelListCache.set(ecoProvider, list)
    }
    const ecoModels = ecoModelListCache.get(ecoProvider)!

    // Step D: try to match the Bearing slug to an EcoLogits model name.
    const ecoModelName = resolveModelName(slug, ecoModels)
    if (!ecoModelName) {
      console.log(`  ${slug}  no match in EcoLogits ${ecoProvider} model list — skipped`)
      skippedNoMatch.push(slug)
      continue
    }

    resolved.push({ bearingSlug: slug, ecoProvider, ecoModelName, confirmed: false })
    console.log(`  ${slug}  auto-resolved → ${ecoProvider}/${ecoModelName}`)
  }

  console.log(`\nResolved: ${resolved.length} | No provider: ${skippedNoProvider.length} | No match: ${skippedNoMatch.length}`)
  console.log('\nFetching GWP estimates…\n')

  // 4. Fetch GWP for each resolved model.
  const rows: SnapshotRow[] = []
  // Track which resolved model each row came from (for display + alias upsert).
  const rowMeta: Array<{ bearingSlug: string; ecoProvider: string; ecoModelName: string; confirmed: boolean }> = []
  const gwpSkipped: string[] = []

  for (const item of resolved) {
    process.stdout.write(`  ${item.bearingSlug} (${item.ecoProvider}/${item.ecoModelName}) … `)
    const result = await fetchGwp(item.ecoProvider, item.ecoModelName)

    if (!result) {
      gwpSkipped.push(item.bearingSlug)
      continue
    }

    const warningStr = result.warnings.length > 0 ? ` [${result.warnings.join(', ')}]` : ''
    console.log(`GWP midpoint: ${(result.gwpMidpoint * 1000).toFixed(4)} gCO2eq${warningStr}`)

    rows.push({
      source: 'ecologits',
      sourceCategory: 'inference_efficiency',
      sourceModelName: item.ecoModelName,
      rawScore: result.gwpMidpoint,
      voteCount: null,
      snapshotDate: SNAPSHOT_DATE,
      lowerIsBetter: true,
      signalType: 'sustainability',
    })
    rowMeta.push(item)
  }

  console.log(`\nFetched: ${rows.length} models | Skipped (GWP error): ${gwpSkipped.length}`)
  if (gwpSkipped.length > 0) console.log(`GWP errors: ${gwpSkipped.join(', ')}`)

  // Display normalised scores locally for verification.
  if (rows.length > 0) {
    const min = Math.min(...rows.map(r => r.rawScore))
    const max = Math.max(...rows.map(r => r.rawScore))
    console.log('\nNormalised scores (lower GWP → higher score):')
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const meta = rowMeta[i]
      const norm = max > min ? 1 - (row.rawScore - min) / (max - min) : 1.0
      console.log(`  ${meta.bearingSlug.padEnd(25)} raw=${(row.rawScore * 1000).toFixed(4)}g  norm=${norm.toFixed(3)}`)
    }
  }

  if (!apply) {
    console.log('\nDry run — no changes written. Pass --apply to commit.')
    return
  }

  // 5. --apply: upsert aliases for newly resolved models, then ingest snapshots.
  console.log('\nUpserting aliases…')
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const meta = rowMeta[i]

    // Skip confirmed aliases — they already exist and should not be re-upserted
    // (avoid overwriting human-curated notes).
    if (meta.confirmed) {
      console.log(`  skipped (already confirmed): ${meta.ecoModelName} → ${meta.bearingSlug}`)
      continue
    }

    await upsertAlias('ecologits', row.sourceModelName, meta.bearingSlug, 'auto-resolved')
    console.log(`  aliased: ${row.sourceModelName} → ${meta.bearingSlug}`)
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
