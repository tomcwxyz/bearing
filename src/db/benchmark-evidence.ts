import { neon } from '@neondatabase/serverless'
import { CATEGORY_TO_TASKS, type BenchmarkSource } from '@/lib/benchmarks'
import type { BenchmarkAggregate } from '@/lib/benchmark-evidence'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

type LatestRow = {
  source: BenchmarkSource
  source_category: string
  bearing_slug: string
  normalised_score: number | string
  vote_count: number | string | null
  snapshot_date: string
}

interface Bucket {
  scores: number[]
  sources: Set<string>
  categories: Set<string>
  latestSnapshot: string | null
  totalVotes: number
  hasVotes: boolean
}

/**
 * Return benchmark aggregates keyed by `${slug}::${taskType}` using the same
 * latest-row semantics and category mapping as production benchmark scoring,
 * but retaining the coverage, recency and sample metadata needed to reason
 * about disagreement.
 */
export async function getBenchmarkAggregatesForModels(
  modelSlugs: string[],
): Promise<Map<string, BenchmarkAggregate>> {
  if (modelSlugs.length === 0) return new Map()

  const rows = await getDb()`
    WITH latest AS (
      SELECT DISTINCT ON (source, source_category, bearing_slug)
        source,
        source_category,
        bearing_slug,
        normalised_score,
        vote_count,
        snapshot_date
      FROM benchmark_snapshots
      WHERE bearing_slug = ANY(${modelSlugs}::text[])
        AND (signal_type = 'task' OR signal_type IS NULL)
      ORDER BY source, source_category, bearing_slug, snapshot_date DESC, captured_at DESC
    )
    SELECT source, source_category, bearing_slug, normalised_score, vote_count, snapshot_date::text
    FROM latest
  ` as LatestRow[]

  const buckets = new Map<string, Bucket>()

  for (const row of rows) {
    const tasks = CATEGORY_TO_TASKS[row.source]?.[row.source_category]
    if (!tasks || tasks.length === 0) continue

    const score = Number(row.normalised_score)
    if (!Number.isFinite(score)) continue

    for (const task of tasks) {
      const key = `${row.bearing_slug}::${task}`
      const bucket = buckets.get(key) ?? {
        scores: [],
        sources: new Set<string>(),
        categories: new Set<string>(),
        latestSnapshot: null,
        totalVotes: 0,
        hasVotes: false,
      }

      bucket.scores.push(score)
      bucket.sources.add(row.source)
      bucket.categories.add(`${row.source}:${row.source_category}`)
      if (!bucket.latestSnapshot || row.snapshot_date > bucket.latestSnapshot) {
        bucket.latestSnapshot = row.snapshot_date
      }

      if (row.vote_count != null) {
        const votes = Number(row.vote_count)
        if (Number.isFinite(votes)) {
          bucket.totalVotes += votes
          bucket.hasVotes = true
        }
      }

      buckets.set(key, bucket)
    }
  }

  const aggregates = new Map<string, BenchmarkAggregate>()
  for (const [key, bucket] of buckets) {
    aggregates.set(key, {
      score: bucket.scores.reduce((sum, value) => sum + value, 0) / bucket.scores.length,
      sourceCount: bucket.sources.size,
      categoryCount: bucket.categories.size,
      latestSnapshot: bucket.latestSnapshot,
      totalVotes: bucket.hasVotes ? bucket.totalVotes : null,
    })
  }

  return aggregates
}
