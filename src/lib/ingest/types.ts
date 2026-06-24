// Shared types for the server-callable benchmark ingest cores.
//
// Each `src/lib/ingest/<source>.ts` module exposes a pure-ish async function
// that fetches → parses → calls `ingestSnapshot`, returning an `IngestResult`.
// No `console.log` / `process.exit`: the CLI scripts and the admin server
// actions both call these and decide how to present the outcome.

import type { BenchmarkSource } from '../benchmarks'

export interface IngestResult {
  source: BenchmarkSource
  /** Rows fetched + parsed from the source before upsert. */
  fetched: number
  /** Rows upserted into benchmark_snapshots. */
  inserted: number
  /** Source model names auto-aliased to a model (exact-unique match). */
  autoMatched: string[]
  /** Source model names still with no alias after auto-matching (need review). */
  unmatched: string[]
  /** ISO date (YYYY-MM-DD) the snapshot was tagged with. */
  snapshotDate: string
}

// EcoLogits resolves per-model against a remote model list, so it reports the
// resolution outcome alongside the base counts.
export interface EcoLogitsIngestResult extends IngestResult {
  /** Slugs whose snapshot was successfully (re)written. */
  updated: string[]
  /** Bearing provider not in ECOLOGITS_PROVIDER_MAP. */
  skippedNoProvider: string[]
  /** No matching model in the EcoLogits provider list. */
  skippedNoMatch: string[]
  /** Matched but the GWP fetch threw. */
  failed: string[]
}

// Optional progress sink so the CLI wrappers can keep their verbose logging
// (rate-limit backoffs, per-model lines) without baking console.log into libs.
export interface IngestOptions {
  log?: (message: string) => void
}

export const noopLog = () => {}
