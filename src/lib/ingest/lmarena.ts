// LMArena leaderboard ingest core.
//
// Pulls the latest LMArena leaderboard snapshot from the Hugging Face datasets
// server and upserts rows into benchmark_snapshots.
//
// Source: https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset (CC-BY-4.0)
//
// We pull three subsets:
//   - text     → per-category rows (overall, coding, math, hard_prompts, etc.)
//   - webdev   → coding-focused arena, tagged `webdev_overall`
//   - vision   → vision arena, tagged `vision_overall`
//
// Server-side fetchable (optional HF_TOKEN to ease rate limits). Callable from
// both the CLI wrapper (scripts/ingest-lmarena.ts) and an admin server action.

import { ingestSnapshot, type SnapshotRow } from '../benchmarks'
import { noopLog, type IngestOptions, type IngestResult } from './types'

const HF_BASE = 'https://datasets-server.huggingface.co/rows'
const DATASET = 'lmarena-ai/leaderboard-dataset'
const PAGE_SIZE = 100

interface HFRow {
  row_idx: number
  row: {
    model_name: string
    organization: string
    rating: number
    rating_lower: number
    rating_upper: number
    vote_count: number
    rank: number
    category: string
    leaderboard_publish_date: string
  }
}

interface HFResponse {
  rows: HFRow[]
  num_rows_total: number
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchPage(
  url: string,
  log: (m: string) => void,
  attempt = 1,
): Promise<HFResponse> {
  const headers: Record<string, string> = {}
  if (process.env.HF_TOKEN) headers.Authorization = `Bearer ${process.env.HF_TOKEN}`
  const res = await fetch(url, { headers })
  if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
    if (attempt > 6) throw new Error(`HF datasets-server gave ${res.status} after ${attempt} attempts`)
    const wait = 5000 * 2 ** (attempt - 1) // 5s, 10s, 20s, 40s, 80s, 160s
    log(`  rate-limited (${res.status}), backing off ${wait}ms (attempt ${attempt})`)
    await sleep(wait)
    return fetchPage(url, log, attempt + 1)
  }
  if (!res.ok) throw new Error(`HF datasets-server returned ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as HFResponse
}

async function fetchSubset(
  subset: string,
  log: (m: string) => void,
  split = 'latest',
): Promise<HFRow[]> {
  const all: HFRow[] = []
  let offset = 0
  while (true) {
    const url = `${HF_BASE}?dataset=${encodeURIComponent(DATASET)}&config=${subset}&split=${split}&offset=${offset}&length=${PAGE_SIZE}`
    const data = await fetchPage(url, log)
    all.push(...data.rows)
    if (offset + data.rows.length >= data.num_rows_total) break
    offset += data.rows.length
    await sleep(2000) // gentle pacing between pages
  }
  return all
}

function toSnapshotRows(hfRows: HFRow[], categoryOverride: string | null): SnapshotRow[] {
  return hfRows.map(r => ({
    source: 'lmarena' as const,
    sourceCategory: categoryOverride ?? r.row.category,
    sourceModelName: r.row.model_name,
    rawScore: r.row.rating,
    voteCount: r.row.vote_count,
    snapshotDate: r.row.leaderboard_publish_date,
  }))
}

/**
 * Fetch all three LMArena subsets and upsert them. Idempotent via the snapshot
 * unique constraint — safe to re-run.
 */
export async function ingestLmArena(opts: IngestOptions = {}): Promise<IngestResult> {
  const log = opts.log ?? noopLog

  log('Pulling LMArena snapshots from Hugging Face...')

  const textRows = await fetchSubset('text', log)
  await sleep(1000)
  const webdevRows = await fetchSubset('webdev', log)
  await sleep(1000)
  const visionRows = await fetchSubset('vision', log)
  log(`  text:   ${textRows.length} rows`)
  log(`  webdev: ${webdevRows.length} rows`)
  log(`  vision: ${visionRows.length} rows`)

  // text rows already carry per-category labels; webdev/vision have a single
  // category each, which we tag explicitly so the task map can resolve them.
  const all: SnapshotRow[] = [
    ...toSnapshotRows(textRows, null),
    ...toSnapshotRows(webdevRows, 'webdev_overall'),
    ...toSnapshotRows(visionRows, 'vision_overall'),
  ]

  const { inserted, unmatched } = await ingestSnapshot(all)
  const snapshotDate = all[0]?.snapshotDate ?? new Date().toISOString().slice(0, 10)

  return { source: 'lmarena', fetched: all.length, inserted, unmatched, snapshotDate }
}
