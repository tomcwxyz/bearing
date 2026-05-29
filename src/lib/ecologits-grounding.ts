// Shared EcoLogits grounding utilities.
//
// Extracted so the batch ingest script (scripts/ingest-ecologits.ts) and the
// live admin import/regrounding action (src/app/admin/actions.ts) share the
// same resolution logic rather than diverging.
//
// The three pure-resolution helpers (ECOLOGITS_PROVIDER_MAP, normaliseName,
// resolveModelName, fetchEcoModelList) are used by the ingest script to drive
// its own per-model logging + dry-run loop.
//
// fetchEcoLogitsScore is the all-in-one helper for admin use: resolve → fetch
// GWP → normalise against current DB cohort → optionally store.

import { neon } from '@neondatabase/serverless'
import { upsertAlias } from './benchmarks'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

const ECOLOGITS_API = 'https://api.ecologits.ai/v1beta/estimations'
const CANONICAL_OUTPUT_TOKENS = 300

// Maps Bearing's `provider` field (from models table) to EcoLogits provider string.
// Only providers EcoLogits supports are listed. Others → skip.
export const ECOLOGITS_PROVIDER_MAP: Record<string, string> = {
  'Anthropic': 'anthropic',
  'OpenAI': 'openai',
  'Google': 'google_genai',
  'Mistral': 'mistralai',
  'Cohere': 'cohere',
  'Meta (via hosted providers)': 'huggingface_hub',
}

/** Normalise a model name for comparison: lowercase + dots→hyphens. */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\./g, '-')
}

/**
 * Match a Bearing slug to the best EcoLogits model name from a provider list.
 * Uses exact match → prefix match → reverse-prefix match in descending
 * confidence order. Returns null if no confident match is found.
 */
export function resolveModelName(slug: string, ecoModels: string[]): string | null {
  const normSlug = normaliseName(slug)

  // 1. Exact match after normalisation.
  for (const m of ecoModels) {
    if (normaliseName(m) === normSlug) return m
  }

  // 2. Bearing slug is a prefix of EcoLogits name (eco adds -preview, date suffix, etc.)
  //    e.g. 'gemini-3-flash' matches 'gemini-3-flash-preview'
  const prefixMatches = ecoModels.filter(m => normaliseName(m).startsWith(normSlug))
  if (prefixMatches.length === 1) return prefixMatches[0]
  if (prefixMatches.length > 1) {
    // Pick shortest name (fewest extra characters beyond the slug).
    return prefixMatches.sort((a, b) => a.length - b.length)[0]
  }

  // 3. EcoLogits name is a prefix of the Bearing slug — pick longest (most specific).
  const reverseMatches = ecoModels.filter(m => normSlug.startsWith(normaliseName(m)))
  if (reverseMatches.length > 0) {
    return reverseMatches.sort((a, b) => b.length - a.length)[0]
  }

  return null
}

/**
 * GET https://api.ecologits.ai/v1beta/models/{provider}
 * Returns array of model name strings for that provider.
 * Returns [] on error (with a console.warn) so callers can skip gracefully.
 */
export async function fetchEcoModelList(provider: string): Promise<string[]> {
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

/**
 * POST to the EcoLogits estimations API for a single provider/model pair.
 * Uses a canonical 300-output-token request with WOR electricity mix.
 * Returns null on any API or body-level error.
 */
export async function fetchGwpRaw(
  provider: string,
  modelName: string,
): Promise<{ gwpMidpoint: number; warnings: string[] } | null> {
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

/**
 * Write a single benchmark_snapshots row with a pre-computed normalised score,
 * bypassing ingestSnapshot's within-batch re-normalisation.
 *
 * Used when we already have the correct cohort-wide normalised_score (computed
 * against the existing DB cohort) and just need to persist it without
 * ingestSnapshot collapsing the single-row batch to linear = 1.0.
 */
async function upsertSnapshotDirect(params: {
  ecoModelName: string
  bearingSlug: string
  rawScore: number
  normalisedScore: number
  snapshotDate: string
}): Promise<void> {
  await getDb()`
    INSERT INTO benchmark_snapshots (
      source, source_category, source_model_name, bearing_slug,
      raw_score, normalised_score, vote_count, snapshot_date, signal_type
    ) VALUES (
      'ecologits', 'inference_efficiency',
      ${params.ecoModelName}, ${params.bearingSlug},
      ${params.rawScore}, ${params.normalisedScore},
      NULL, ${params.snapshotDate}, 'sustainability'
    )
    ON CONFLICT (source, source_category, source_model_name, snapshot_date)
    DO UPDATE SET
      raw_score        = EXCLUDED.raw_score,
      normalised_score = EXCLUDED.normalised_score,
      bearing_slug     = EXCLUDED.bearing_slug,
      signal_type      = EXCLUDED.signal_type,
      captured_at      = now()
  `
}

/**
 * Query min/max raw_score from the existing ecologits cohort in benchmark_snapshots.
 * Used to normalise a new GWP reading against the current distribution.
 */
async function getCohortStats(): Promise<{ min: number | null; max: number | null }> {
  const rows = await getDb()`
    SELECT MIN(raw_score) as min, MAX(raw_score) as max
    FROM benchmark_snapshots
    WHERE source = 'ecologits' AND source_category = 'inference_efficiency'
  `
  return { min: rows[0]?.min ?? null, max: rows[0]?.max ?? null }
}

/**
 * All-in-one EcoLogits grounding for a single Bearing model.
 *
 * 1. Maps Bearing provider → EcoLogits provider (returns null if not covered).
 * 2. Fetches the EcoLogits model list and resolves the slug → eco model name.
 * 3. Fetches GWP from the estimations API.
 * 4. Normalises against the current DB cohort (lower GWP → higher score).
 * 5. Optionally stores the snapshot + alias in the DB (default: true).
 *
 * Returns null if the model is not covered by EcoLogits or the API fails.
 */
export async function fetchEcoLogitsScore(
  slug: string,
  provider: string,
  opts: { storeInDb?: boolean } = {},
): Promise<{ normalisedScore: number; rawGwp: number; ecoProvider: string; ecoModelName: string } | null> {
  const { storeInDb = true } = opts

  const ecoProvider = ECOLOGITS_PROVIDER_MAP[provider]
  if (!ecoProvider) return null

  const ecoModels = await fetchEcoModelList(ecoProvider)
  if (ecoModels.length === 0) return null

  const ecoModelName = resolveModelName(slug, ecoModels)
  if (!ecoModelName) return null

  const gwpResult = await fetchGwpRaw(ecoProvider, ecoModelName)
  if (!gwpResult) return null

  const { gwpMidpoint } = gwpResult

  // Normalise against the existing cohort in benchmark_snapshots.
  // Extend the [min, max] window to include this new reading so the returned
  // score is comparable to what will be stored after ingestSnapshot runs.
  const cohortStats = await getCohortStats()
  const extMin = Math.min(cohortStats.min ?? gwpMidpoint, gwpMidpoint)
  const extMax = Math.max(cohortStats.max ?? gwpMidpoint, gwpMidpoint)
  const range = extMax - extMin
  const normalisedScore = range > 0 ? Math.max(0, Math.min(1, 1 - (gwpMidpoint - extMin) / range)) : 1.0

  if (storeInDb) {
    const snapshotDate = new Date().toISOString().split('T')[0]
    // upsertAlias must run first so upsertSnapshotDirect can write bearing_slug.
    await upsertAlias('ecologits', ecoModelName, slug)
    // Use direct upsert (not ingestSnapshot) to preserve the normalisedScore we
    // already computed against the full DB cohort. ingestSnapshot re-normalises
    // within its input batch — for a single row min === max → linear = 1.0 →
    // with lowerIsBetter the score collapses to 0.0 regardless of actual GWP.
    await upsertSnapshotDirect({
      ecoModelName,
      bearingSlug: slug,
      rawScore: gwpMidpoint,
      normalisedScore,
      snapshotDate,
    })
  }

  return { normalisedScore, rawGwp: gwpMidpoint, ecoProvider, ecoModelName }
}
