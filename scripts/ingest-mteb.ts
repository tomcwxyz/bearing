// MTEB (Massive Text Embedding Benchmark) ingest.
//
// MTEB does not currently offer a queryable Hugging Face dataset-server
// endpoint — `mteb/results` ships a legacy dataset-script and the dataset
// viewer returns a ConfigNamesError as of 2026-05-23. The raw per-task JSONs
// live at github.com/embeddings-benchmark/results but pulling 100+ task files
// per model and aggregating per category is significant scope.
//
// Pragmatic path for phase 4: ingest MTEB **Overall** averages for our 10
// seed embedding models from each model's publisher-cited headline number.
// One row per model, source_category = 'overall'. These are stable, public,
// well-cited values; the alternative (manually averaging 50+ task JSONs)
// reproduces what publishers already do. Phase 5 may swap this for per-task
// ingest if/when MTEB's HF dataset is repaired or we want sub-category
// weighting in scoring.
//
// All MTEB scores are released under MIT (Muennighoff et al. 2023). Citation
// lives in src/data/bearing-registry.json scoring_methodology.benchmarks.
//
// Usage:
//   npx tsx scripts/ingest-mteb.ts            # dry-run (default)
//   npx tsx scripts/ingest-mteb.ts --apply    # commit to benchmark_snapshots
//                                             # + upsert aliases

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { ingestSnapshot, upsertAlias, type SnapshotRow } from '../src/lib/benchmarks'

const apply = process.argv.includes('--apply')

// Snapshot date — when MTEB last refreshed the leaderboard for these models.
// Bumped whenever this file is re-curated.
const SNAPSHOT_DATE = '2026-05-23'

interface MtebSeed {
  // The model name MTEB / publishers use on their leaderboard. Stored as
  // source_model_name so admins can re-match later if needed.
  sourceModelName: string
  // Our slug — written into benchmark_aliases at apply time.
  bearingSlug: string
  // Headline MTEB Overall average. 0..100 scale (matches MTEB's display).
  mtebOverall: number
  // Where this number came from — kept as a comment-style note for
  // future curators.
  sourceCitation: string
}

// Each row's `mtebOverall` is the publisher's headline MTEB(-Eng/-Multi)
// Overall average, cited per row. Values are normalised to 0..1 by the
// ingest pipeline against the cohort min/max — preserving rank order, not
// absolute calibration.
const SEEDS: MtebSeed[] = [
  // --- Hosted flagships ---
  {
    sourceModelName: 'voyage-3-large',
    bearingSlug: 'voyage-3-large',
    mtebOverall: 74.06,
    sourceCitation: 'Voyage AI release note Jan 2025 — top of MTEB-Eng v1 at release.',
  },
  {
    sourceModelName: 'Cohere-embed-v4.0',
    bearingSlug: 'cohere-embed-v4',
    mtebOverall: 74.0,
    sourceCitation: 'Cohere blog April 2025 announcing embed-v4 (MMTEB / MTEB-Multi leadership).',
  },
  {
    sourceModelName: 'text-embedding-3-large',
    bearingSlug: 'openai-embed-3-large',
    mtebOverall: 64.59,
    sourceCitation: 'OpenAI announcement Jan 2024; MTEB-Eng-v1 average per OpenAI cookbook.',
  },

  // --- Hosted budget ---
  {
    sourceModelName: 'voyage-3-lite',
    bearingSlug: 'voyage-3-lite',
    mtebOverall: 62.5,
    sourceCitation: 'Voyage AI release page — voyage-3-lite Overall average.',
  },
  {
    sourceModelName: 'text-embedding-3-small',
    bearingSlug: 'openai-embed-3-small',
    mtebOverall: 62.26,
    sourceCitation: 'OpenAI Jan 2024 announcement; MTEB-Eng-v1 average.',
  },

  // --- Hosted balanced + sustainable ---
  {
    sourceModelName: 'mistral-embed-2',
    bearingSlug: 'mistral-embed-2',
    mtebOverall: 62.0,
    sourceCitation: 'Mistral docs (mistral-embed product page); approximate MTEB-Eng score.',
  },
  {
    sourceModelName: 'Qwen3-Embedding-4B',
    bearingSlug: 'greenpt-green-embedding',
    mtebOverall: 70.58,
    sourceCitation: 'Qwen3-Embedding-4B HF model card — the open model GreenPT hosts under green-embedding.',
  },

  // --- Open weights (local-deployable) ---
  {
    sourceModelName: 'gte-Qwen2-7B-instruct',
    bearingSlug: 'gte-qwen2-7b',
    mtebOverall: 70.24,
    sourceCitation: 'Alibaba NLP HF model card — top-of-class open MTEB at release.',
  },
  {
    sourceModelName: 'bge-m3',
    bearingSlug: 'bge-m3',
    mtebOverall: 66.5,
    sourceCitation: 'BAAI bge-m3 HF model card — MTEB-Multi average for multilingual setting.',
  },
  {
    sourceModelName: 'nomic-embed-text-v2-moe',
    bearingSlug: 'nomic-embed-v2-moe',
    mtebOverall: 64.0,
    sourceCitation: 'Nomic blog Feb 2025 announcing nomic-embed-v2-moe.',
  },
]

async function main() {
  console.log(`MTEB ingest (snapshot date ${SNAPSHOT_DATE})\n`)
  console.log('Seed plan:')
  for (const s of SEEDS) {
    console.log(`  ${s.sourceModelName.padEnd(28)} → ${s.bearingSlug.padEnd(28)}  ${s.mtebOverall.toFixed(2)}`)
  }

  const rows: SnapshotRow[] = SEEDS.map(s => ({
    source: 'mteb' as const,
    sourceCategory: 'overall',
    sourceModelName: s.sourceModelName,
    rawScore: s.mtebOverall,
    voteCount: null, // MTEB doesn't use Bradley-Terry; no vote count concept.
    snapshotDate: SNAPSHOT_DATE,
  }))

  if (!apply) {
    console.log('\nDry-run — no DB writes. Pass --apply to commit.')
    return
  }

  // Step 1 — seed aliases. ingestSnapshot uses the alias map to resolve
  // bearing_slug per snapshot row, so the aliases must exist first.
  for (const s of SEEDS) {
    await upsertAlias('mteb', s.sourceModelName, s.bearingSlug, s.sourceCitation)
  }
  console.log(`\nUpserted ${SEEDS.length} aliases.`)

  // Step 2 — ingest snapshots. The pipeline normalises per cohort so the
  // best model in this batch lands at 1.0 and the worst at 0.0.
  const { inserted, unmatched } = await ingestSnapshot(rows)
  console.log(`Upserted ${inserted} snapshot rows.`)
  if (unmatched.length > 0) {
    console.log(`\nUnmatched (no alias): ${unmatched.length}`)
    for (const u of unmatched) console.log(`  - ${u}`)
  }

  console.log('\nDone. Verify with: SELECT * FROM benchmark_snapshots WHERE source=\'mteb\' ORDER BY normalised_score DESC;')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
