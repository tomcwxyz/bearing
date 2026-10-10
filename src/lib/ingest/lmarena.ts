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
import { autoMatchUnmatched } from './auto-match'
import { noopLog, type IngestOptions, type IngestResult } from './types'

const HF_BASE = 'https://datasets-server.huggingface.co/rows'
const DATASET = 'lmarena-ai/leaderboard-dataset'
const PAGE_SIZE = 100
const PAGE_CONCURRENCY = 6

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
  const url = (offset: number) => `${HF_BASE}?dataset=${encodeURIComponent(DATASET)}&config=${subset}&split=${split}&offset=${offset}&length=${PAGE_SIZE}`
  const first = await fetchPage(url(0), log)
  if (!Number.isFinite(first.num_rows_total) || first.num_rows_total < 0 || first.num_rows_total > 1000000) {
    throw new Error(`Invalid LMArena row count for ${subset}`)
  }
  const result = [...first.rows]
  const offsets: number[] = []
  for (let offset = PAGE_SIZE; offset < first.num_rows_total; offset += PAGE_SIZE) offsets.push(offset)
  for (let start = 0; start < offsets.length; start += PAGE_CONCURRENCY) {
    const batch = offsets.slice(start, start + PAGE_CONCURRENCY)
    const pages = await Promise.all(batch.map(offset => fetchPage(url(offset), log)))
    for (let i = 0; i < pages.length; i++) {
      if (!pages[i].rows.length) throw new Error(`Incomplete LMArena page: ${subset} at ${batch[i]}`)
      result.push(...pages[i].rows)
    }
    log(`  ${subset}: fetched ${result.length}/${first.num_rows_total} rows`)
  }
  if (result.length !== first.num_rows_total) {
    throw new Error(`Incomplete LMArena ${subset} result: ${result.length}/${first.num_rows_total}`)
  }
  return result
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

/** Refresh one independently recoverable LMArena dataset. The caller tracks
 * its own status. Retrying text never prevents WebDev or Vision progressing. */
export async function ingestLmArenaSubset(
  subset: 'text' | 'webdev' | 'vision',
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const log = opts.log ?? noopLog
  log(`Refreshing LMArena ${subset}…`)
  const raw = await fetchSubset(subset, log)
  if (raw.length === 0) throw new Error(`Empty ${subset} dataset; refresh not applied`)
  const rows = toSnapshotRows(raw, subset === 'text' ? null : `${subset}_overall`)
  const { inserted, unmatched, duplicatesRemoved, conflictingKeys } = await ingestSnapshot(rows)
  const dates = rows.map(row => row.snapshotDate).filter(Boolean).sort()
  const snapshotDate = dates.at(-1) ?? ''
  const { autoMatched, stillUnmatched } = await autoMatchUnmatched('lmarena', unmatched, log)
  return {
    source: 'lmarena', fetched: raw.length, inserted, autoMatched,
    unmatched: stillUnmatched, snapshotDate, duplicatesRemoved, conflictingKeys,
  }
}

/**
 * Fetch all three LMArena subsets and upsert them. Idempotent via the snapshot
 * unique constraint — safe to re-run.
 */
export async function ingestLmArena(opts: IngestOptions = {}): Promise<IngestResult> {
  // CLI compatibility: all three subsets are still available as a single
  // command, but the Vercel cron/admin UI invoke each subset independently.
  const results: IngestResult[] = []
  for (const subset of ['text', 'webdev', 'vision'] as const) {
    results.push(await ingestLmArenaSubset(subset, opts))
  }
  return {
    source: 'lmarena',
    fetched: results.reduce((n, r) => n + r.fetched, 0),
    inserted: results.reduce((n, r) => n + r.inserted, 0),
    autoMatched: [...new Set(results.flatMap(r => r.autoMatched))],
    unmatched: [...new Set(results.flatMap(r => r.unmatched))],
    snapshotDate: results.map(r => r.snapshotDate).sort().at(-1) ?? '',
    duplicatesRemoved: results.reduce((n, r) => n + (r.duplicatesRemoved ?? 0), 0),
    conflictingKeys: results.reduce((n, r) => n + (r.conflictingKeys ?? 0), 0),
  }
}
