import type { SnapshotRow } from './benchmarks'

/**
 * A benchmark_snapshots row is uniquely identified by this exact tuple.
 *
 * LMArena sometimes publishes multiple leaderboard rows for one model,
 * category and date. PostgreSQL cannot update the same conflict target twice
 * in one INSERT ... ON CONFLICT DO UPDATE statement, so dedupe *before*
 * normalising and chunking. This also keeps cohort normalisation consistent
 * when duplicates happen to straddle two 300-row batches.
 */
export function snapshotConflictKey(row: SnapshotRow): string {
  return JSON.stringify([row.source, row.sourceCategory, row.sourceModelName, row.snapshotDate])
}

export interface DeduplicatedSnapshots {
  rows: SnapshotRow[]
  duplicatesRemoved: number
  conflictingKeys: number
}

/** Select the row based on the largest sample of votes. On ties prefer the
 * conservative score (lower for higher-is-better; higher for lower-is-better).
 * The tie-break never depends on pagination order. The conflict count lets
 * operators investigate model/date/category collisions at the source.
 */
function preferred(a: SnapshotRow, b: SnapshotRow): SnapshotRow {
  const aVotes = a.voteCount ?? -1
  const bVotes = b.voteCount ?? -1
  if (aVotes !== bVotes) return aVotes > bVotes ? a : b
  if (a.lowerIsBetter !== b.lowerIsBetter) {
    // Do not silently infer that two different metric directions are the same.
    // Use a stable tie-break and count this as a conflicting upstream key.
    return a.lowerIsBetter ? a : b
  }
  if (a.rawScore !== b.rawScore) {
    return a.lowerIsBetter
      ? (a.rawScore > b.rawScore ? a : b)
      : (a.rawScore < b.rawScore ? a : b)
  }
  if (a.normalisedScore !== b.normalisedScore) {
    return (a.normalisedScore ?? -1) <= (b.normalisedScore ?? -1) ? a : b
  }
  // Same metric and vote count. Pick a stable signal if this malformed source
  // key spans multiple signal types; it will be reported as a conflict.
  return (a.signalType ?? 'task') <= (b.signalType ?? 'task') ? a : b
}

function scoresDiffer(a: SnapshotRow, b: SnapshotRow): boolean {
  return a.rawScore !== b.rawScore
    || a.voteCount !== b.voteCount
    || (a.signalType ?? 'task') !== (b.signalType ?? 'task')
    || (a.normalisedScore ?? null) !== (b.normalisedScore ?? null)
    || Boolean(a.lowerIsBetter) !== Boolean(b.lowerIsBetter)
}

export function deduplicateSnapshotRows(input: SnapshotRow[]): DeduplicatedSnapshots {
  const byKey = new Map<string, SnapshotRow>()
  const conflicts = new Set<string>()
  let duplicatesRemoved = 0

  for (const candidate of input) {
    const key = snapshotConflictKey(candidate)
    const previous = byKey.get(key)
    if (!previous) {
      byKey.set(key, candidate)
      continue
    }

    duplicatesRemoved++
    if (scoresDiffer(previous, candidate)) conflicts.add(key)
    byKey.set(key, preferred(previous, candidate))
  }

  return {
    rows: Array.from(byKey.values()),
    duplicatesRemoved,
    conflictingKeys: conflicts.size,
  }
}
