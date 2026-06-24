// Shared post-ingest auto-match step for the cohort sources (lmarena, AA).
//
// ingestSnapshot() reports unmatched names prefixed with `${source}::`. This
// strips the prefix, runs the strict exact-unique auto-matcher, and returns the
// names that were auto-aliased plus those still needing manual review.

import { autoApplyAliases, type BenchmarkSource } from '../benchmarks'

export async function autoMatchUnmatched(
  source: BenchmarkSource,
  unmatched: string[],
  log: (message: string) => void,
): Promise<{ autoMatched: string[]; stillUnmatched: string[] }> {
  const prefix = `${source}::`
  const bare = unmatched.map(u => (u.startsWith(prefix) ? u.slice(prefix.length) : u))
  const autoMatched = await autoApplyAliases(source, bare)
  if (autoMatched.length > 0) log(`  auto-matched ${autoMatched.length} model(s) to a slug`)
  const stillUnmatched = bare.filter(n => !autoMatched.includes(n))
  return { autoMatched, stillUnmatched }
}
