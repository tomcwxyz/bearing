// Pulls the latest Artificial Analysis model evaluations and upserts rows into
// benchmark_snapshots. One row per (model, eval-key) for task signals plus
// `aa_speed` and `aa_ttft` rows for per-model throughput/latency.
//
// Source: https://artificialanalysis.ai/api-reference#models-endpoint
//   GET https://artificialanalysis.ai/api/v2/data/llms/models
//   header x-api-key: $ARTIFICIAL_ANALYSIS_API_KEY
//
// Usage: npx tsx scripts/ingest-artificialanalysis.ts

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { ingestSnapshot, type SnapshotRow } from '../src/lib/benchmarks'

const AA_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models'

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
}

interface AaResponse {
  status: number
  data: AaModel[]
}

// Map AA's evaluation keys to our `source_category` strings (must align with
// CATEGORY_TO_TASKS.artificialanalysis in src/lib/benchmarks.ts).
const EVAL_KEY_TO_CATEGORY: Record<string, string> = {
  artificial_analysis_intelligence_index: 'aa_intelligence',
  artificial_analysis_coding_index: 'aa_coding',
  artificial_analysis_math_index: 'aa_math',
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

async function fetchModels(): Promise<AaModel[]> {
  const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY
  if (!apiKey) throw new Error('ARTIFICIAL_ANALYSIS_API_KEY not set in .env.local')

  // AA occasionally returns a transient 500 with "Could not query the database
  // for the schema cache. Retrying." — back off and retry a handful of times.
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(AA_URL, { headers: { 'x-api-key': apiKey } })
    if (res.ok) {
      const body = (await res.json()) as AaResponse | { error: string; details?: string }
      if ('data' in body) return body.data
      lastError = new Error(`AA transient error: ${body.error}${body.details ? ' — ' + body.details : ''}`)
    } else {
      lastError = new Error(`AA returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    const wait = 3000 * 2 ** (attempt - 1)
    console.log(`  attempt ${attempt} failed (${lastError.message}); retrying in ${wait}ms`)
    await new Promise(r => setTimeout(r, wait))
  }
  throw lastError ?? new Error('AA fetch failed')
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

async function main() {
  console.log('Pulling Artificial Analysis snapshot...')
  const models = await fetchModels()
  console.log(`  ${models.length} models received`)

  const snapshotDate = new Date().toISOString().slice(0, 10)
  const rows = buildSnapshotRows(models, snapshotDate)
  console.log(`  ${rows.length} snapshot rows to upsert (date ${snapshotDate})`)

  const { inserted, unmatched } = await ingestSnapshot(rows)
  console.log(`\nUpserted ${inserted} snapshot rows.`)
  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} models have no benchmark_aliases entry yet.`)
    console.log('Run scripts/seed-aa-aliases.ts or use the admin Benchmarks tab.')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
