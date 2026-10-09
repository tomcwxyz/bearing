// Artificial Analysis ingest core.
//
// Pulls the latest Artificial Analysis model evaluations and upserts rows into
// benchmark_snapshots. One row per (model, eval-key) for task signals plus
// `aa_speed` and `aa_ttft` rows for per-model throughput/latency.
//
// Source: https://artificialanalysis.ai/api-reference#models-endpoint
//   GET https://artificialanalysis.ai/api/v2/data/llms/models
//   header x-api-key: $ARTIFICIAL_ANALYSIS_API_KEY
//
// Server-side fetchable (requires ARTIFICIAL_ANALYSIS_API_KEY). Callable from
// both the CLI wrapper (scripts/ingest-artificialanalysis.ts) and an admin
// server action.

import { ingestSnapshot, type SnapshotRow } from '../benchmarks'
import { autoMatchUnmatched } from './auto-match'
import { noopLog, type IngestOptions, type IngestResult } from './types'

// V2 replaces /data/llms/models on 4 November 2026. Pro includes granular
// evaluations; Free supplies headline indices and performance.
const AA_PRO_URL = 'https://artificialanalysis.ai/api/v2/language/models'
const AA_FREE_URL = 'https://artificialanalysis.ai/api/v2/language/models/free'

interface AaEvaluations {
  artificial_analysis_intelligence_index?: number | null
  artificial_analysis_coding_index?: number | null
  artificial_analysis_math_index?: number | null
  mmlu_pro?: number | null
  gpqa?: number | null
  hle?: number | null
  livecodebench?: number | null
  scicode?: number | null
  aime_25?: number | null
  math_500?: number | null
  ifbench?: number | null
  tau2?: number | null
  terminalbench_hard?: number | null
  lcr?: number | null
  // unused fields tolerated
  [key: string]: number | null | undefined
}

interface AaModel {
  id: string
  slug: string
  name: string
  release_date: string | null
  evaluations: AaEvaluations
  median_output_tokens_per_second: number | null
  median_time_to_first_token_seconds: number | null
  performance?: {
    median_output_tokens_per_second?: number | null
    median_time_to_first_token_seconds?: number | null
  }
}

interface AaResponse {
  tier?: string
  data: AaModel[]
  pagination?: {
    has_more: boolean
    page: number
    total_pages: number
  }
}

// Map AA's evaluation keys to our `source_category` strings (must align with
// CATEGORY_TO_TASKS.artificialanalysis in src/lib/benchmarks.ts).
const EVAL_KEY_TO_CATEGORY: Record<string, string> = {
  artificial_analysis_intelligence_index: 'aa_intelligence',
  artificial_analysis_coding_index: 'aa_coding',
  artificial_analysis_math_index: 'aa_math',
  artificial_analysis_agentic_index: 'aa_agentic',
  terminalbench_v2_1: 'terminalbench_v2_1',
  tau2_telecom: 'tau2_telecom',
  tau_banking: 'tau_banking',
  aa_lcr: 'lcr',
  mmlu_pro: 'mmlu_pro',
  gpqa: 'gpqa',
  hle: 'hle',
  livecodebench: 'livecodebench',
  scicode: 'scicode',
  aime_25: 'aime_25',
  math_500: 'math_500',
  ifbench: 'ifbench',
  tau2: 'tau2',
  terminalbench_hard: 'terminalbench_hard',
  lcr: 'lcr',
}

async function fetchModels(log: (m: string) => void): Promise<AaModel[]> {
  const apiKey = process.env.AA_API_KEY ?? process.env.ARTIFICIAL_ANALYSIS_API_KEY
  if (!apiKey) throw new Error('AA_API_KEY or ARTIFICIAL_ANALYSIS_API_KEY not set')

  // Pro and commercial keys receive the granular category scores. Free keys
  // are supported, but return only AA's headline indices.
  let endpoint = AA_PRO_URL
  const models: AaModel[] = []
  let page = 1

  while (true) {
    let body: AaResponse | null = null
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch(`${endpoint}?page=${page}`, {
        headers: { 'x-api-key': apiKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(25000),
      })
      if (res.status === 403 && endpoint === AA_PRO_URL) {
        log('  AA key has Free access: using headline indices')
        endpoint = AA_FREE_URL
        models.length = 0
        page = 1
        break
      }
      if (res.ok) {
        const parsed = await res.json() as AaResponse
        if (!Array.isArray(parsed.data)) throw new Error('Unexpected AA response: missing data array')
        body = parsed
        break
      }
      const msg = (await res.text()).slice(0, 250)
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Artificial Analysis access rejected (HTTP ${res.status}): ${msg}`)
      }
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`Artificial Analysis returned HTTP ${res.status}: ${msg}`)
      }
      if (attempt === 4) throw new Error(`Artificial Analysis HTTP ${res.status} after retries: ${msg}`)
      const backoff = 1500 * 2 ** (attempt - 1)
      log(`  AA HTTP ${res.status}; retrying in ${backoff}ms`)
      await new Promise(resolve => setTimeout(resolve, backoff))
    }
    if (!body) continue // Free fallback changed the endpoint.

    for (const model of body.data) {
      models.push({
        ...model,
        median_output_tokens_per_second:
          model.performance?.median_output_tokens_per_second
          ?? model.median_output_tokens_per_second ?? null,
        median_time_to_first_token_seconds:
          model.performance?.median_time_to_first_token_seconds
          ?? model.median_time_to_first_token_seconds ?? null,
      })
    }
    if (!body.pagination?.has_more) break
    page++
    if (page > 100) throw new Error('AA pagination exceeded 100 pages; refusing partial import')
  }
  return models
}

function buildSnapshotRows(models: AaModel[], snapshotDate: string): SnapshotRow[] {
  const rows: SnapshotRow[] = []
  for (const m of models) {
    // Task-signal rows: one per populated evaluation key.
    for (const [evalKey, category] of Object.entries(EVAL_KEY_TO_CATEGORY)) {
      const v = m.evaluations?.[evalKey]
      if (typeof v !== 'number' || Number.isNaN(v)) continue
      rows.push({
        source: 'artificialanalysis',
        sourceCategory: category,
        sourceModelName: m.name,
        rawScore: v,
        voteCount: null,
        snapshotDate,
        signalType: 'task',
      })
    }

    // Speed: tokens per second, higher better. Cohort-normalised across all AA models.
    if (typeof m.median_output_tokens_per_second === 'number') {
      rows.push({
        source: 'artificialanalysis',
        sourceCategory: 'aa_speed',
        sourceModelName: m.name,
        rawScore: m.median_output_tokens_per_second,
        voteCount: null,
        snapshotDate,
        signalType: 'speed',
      })
    }

    // TTFT: seconds, lower better. Inverted at normalisation time.
    if (typeof m.median_time_to_first_token_seconds === 'number') {
      rows.push({
        source: 'artificialanalysis',
        sourceCategory: 'aa_ttft',
        sourceModelName: m.name,
        rawScore: m.median_time_to_first_token_seconds,
        voteCount: null,
        snapshotDate,
        signalType: 'latency',
        lowerIsBetter: true,
      })
    }
  }
  return rows
}

/**
 * Fetch the AA models endpoint and upsert task + speed + latency rows. Always
 * ingests the whole source (cohort-safe). Idempotent via the snapshot unique
 * constraint.
 */
export async function ingestArtificialAnalysis(opts: IngestOptions = {}): Promise<IngestResult> {
  const log = opts.log ?? noopLog

  log('Pulling Artificial Analysis snapshot...')
  const models = await fetchModels(log)
  log(`  ${models.length} models received`)

  const snapshotDate = new Date().toISOString().slice(0, 10)
  const rows = buildSnapshotRows(models, snapshotDate)
  log(`  ${rows.length} snapshot rows to upsert (date ${snapshotDate})`)

  const { inserted, unmatched } = await ingestSnapshot(rows)

  const { autoMatched, stillUnmatched } = await autoMatchUnmatched('artificialanalysis', unmatched, log)

  return { source: 'artificialanalysis', fetched: rows.length, inserted, autoMatched, unmatched: stillUnmatched, snapshotDate }
}
