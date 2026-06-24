// Benchmark ingestion + read helpers.
//
// External sources (LMArena, LiveBench, ...) publish per-category scores for
// many models. We store raw rows in `benchmark_snapshots`, resolve the source's
// model name to our `bearing_slug` via `benchmark_aliases`, and at scoring time
// blend the normalised score into `task_fitness[task]`.
//
// The category → bearing task type map is kept here (logic, not data) so it
// version-controls alongside the scoring code.

import { neon } from '@neondatabase/serverless'
import type { TaskType } from './registry'
import { autoMatchSlug, type BearingModelMeta } from './alias-matching'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export type BenchmarkSource = 'lmarena' | 'livebench' | 'artificialanalysis' | 'mteb' | 'ecologits'

export type SignalType = 'task' | 'speed' | 'latency' | 'sustainability'

// Maps a source's category name onto one or more bearing task types.
// A source category can map to multiple task types (e.g. LiveBench "language"
// is a reasonable signal for both summarise and generate).
// Translate has no direct benchmark coverage in any source — stays curated.
// Non-task signals (speed, latency) are NOT in this map; they're read by
// getLatestPerformanceSignals() instead.
export const CATEGORY_TO_TASKS: Record<BenchmarkSource, Record<string, TaskType[]>> = {
  lmarena: {
    // From the `text` subset (rows carry a per-category column).
    // `overall` is preference-on-open-prompts — split between conversation
    // and qa (single-turn factual queries dominate the prompt mix).
    overall: ['conversation', 'qa'],
    // `hard_prompts` is the hardest-rated subset of `overall`: long
    // multi-step prompts where preference correlates strongly with reasoning.
    hard_prompts: ['reasoning', 'analyse'],
    coding: ['code'],
    // LMArena's `math` is preference on maths prompts — strong math signal.
    math: ['math'],
    creative_writing: ['generate'],
    // Instruction-following is the cleanest signal for `extract` (structured
    // output) and `comms` (responding correctly to short formatted requests).
    instruction_following: ['extract', 'comms'],
    // Longer queries reward both analysis and research (the model often has
    // to bring in domain knowledge or cite plausibly).
    longer_query: ['analyse', 'research'],
    multi_turn: ['conversation'],
    webdev_overall: ['code'],
    // Vision-arena measures multimodal interpretation. `vision` is no longer
    // a task type (it's a capability); the signal feeds analysis-of-images
    // and extraction-from-images equally.
    vision_overall: ['analyse', 'extract'],
  },
  livebench: {
    // LiveBench reasoning subset: pure reasoning category.
    reasoning: ['reasoning'],
    coding: ['code'],
    // LiveBench mathematics: now feeds `math` directly.
    mathematics: ['math'],
    // Language category: summary + generation skill.
    language: ['summarise', 'generate'],
    // Data analysis: a mix of extraction and analytical interpretation.
    data_analysis: ['analyse', 'extract'],
    instruction_following: ['extract'],
  },
  artificialanalysis: {
    // AA top-line indices.
    // aa_intelligence is a composite of MMLU/GPQA/HLE/AIME — primarily a
    // reasoning + analysis signal. Also a reasonable proxy for qa breadth.
    aa_intelligence: ['reasoning', 'analyse', 'qa'],
    aa_coding: ['code'],
    aa_math: ['math'],
    // Knowledge-style multi-choice benchmarks → qa + analyse.
    mmlu_pro: ['qa', 'analyse'],
    // GPQA and HLE are graduate-level reasoning under tight constraints.
    gpqa: ['reasoning', 'analyse'],
    hle: ['reasoning', 'analyse'],
    livecodebench: ['code'],
    scicode: ['code'],
    // Maths-specific tests now map directly to `math`.
    aime_25: ['math'],
    math_500: ['math'],
    ifbench: ['extract'],
    // Agentic-coding benchmarks — primary signal is code, but also a
    // weaker proxy for `reasoning` (planning multi-step actions).
    tau2: ['code', 'reasoning'],
    terminalbench_hard: ['code', 'reasoning'],
    lcr: ['code'],
  },
  // MTEB (Massive Text Embedding Benchmark). All four sub-categories collapse
  // to the single `embedding` task type — the four are highly correlated and
  // the recommender only needs one quality signal per embedding model.
  // `mteb.overall` is the headline average that publishers cite on model
  // cards; the four sub-categories exist as future-compatible buckets if we
  // ever want to weight retrieval vs STS differently in scoring.
  mteb: {
    overall: ['embedding'],
    retrieval: ['embedding'],
    sts: ['embedding'],
    classification: ['embedding'],
    clustering: ['embedding'],
  },
  // EcoLogits: inference-time environmental impact. inference_efficiency does
  // NOT map to any task type quality score — it feeds sustainability scoring
  // only. Empty task array signals this to getLatestBenchmarkScores().
  ecologits: {
    inference_efficiency: [],
  },
}

export interface SnapshotRow {
  source: BenchmarkSource
  sourceCategory: string
  sourceModelName: string
  rawScore: number
  voteCount: number | null
  snapshotDate: string // YYYY-MM-DD
  /** 'task' (default) | 'speed' | 'latency'. Non-task rows are excluded from getLatestBenchmarkScores. */
  signalType?: SignalType
  /** When true, normalisation inverts so the lowest raw score becomes 1.0 (e.g. latency, where lower is better). */
  lowerIsBetter?: boolean
  /**
   * Pre-computed 0..1 score. When set, it is stored verbatim and cohort min-max
   * scaling is skipped for this row — used by sources scored on an absolute
   * curve (e.g. EcoLogits gwpToScore) where the value must not depend on the
   * batch. Takes precedence over lowerIsBetter.
   */
  normalisedScore?: number
}

/** Look up the bearing_slug for a source's model name. */
export async function resolveAlias(
  source: BenchmarkSource,
  sourceModelName: string,
): Promise<string | null> {
  const rows = await getDb()`
    SELECT bearing_slug FROM benchmark_aliases
    WHERE source = ${source} AND source_model_name = ${sourceModelName}
  `
  return rows.length > 0 ? (rows[0].bearing_slug as string) : null
}

/**
 * Insert a batch of snapshot rows. Normalises raw scores linearly within each
 * (source, source_category, snapshot_date) bucket so the highest-scoring model
 * in the cohort lands at 1.0 and the lowest at 0.0. Rows carrying an explicit
 * `normalisedScore` skip cohort scaling and store that value directly (used by
 * absolute-curve sources like EcoLogits).
 *
 * Resolves bearing_slug for each row via benchmark_aliases. Rows with no alias
 * are still stored (so we can audit coverage) but bearing_slug is left NULL.
 *
 * Idempotent: re-running with the same (source, category, model, date) is a
 * no-op via the unique constraint + DO UPDATE.
 */
export async function ingestSnapshot(rows: SnapshotRow[]): Promise<{
  inserted: number
  unmatched: string[]
}> {
  if (rows.length === 0) return { inserted: 0, unmatched: [] }

  // Normalise per cohort.
  const cohorts = new Map<string, { min: number; max: number }>()
  for (const r of rows) {
    const key = `${r.source}::${r.sourceCategory}::${r.snapshotDate}`
    const c = cohorts.get(key)
    if (!c) {
      cohorts.set(key, { min: r.rawScore, max: r.rawScore })
    } else {
      if (r.rawScore < c.min) c.min = r.rawScore
      if (r.rawScore > c.max) c.max = r.rawScore
    }
  }

  // Pre-load alias map for the sources we're touching to avoid N round-trips.
  const sources = [...new Set(rows.map(r => r.source))]
  const aliasMap = new Map<string, string>() // key: `${source}::${sourceModelName}`
  for (const source of sources) {
    const aliasRows = await getDb()`
      SELECT source_model_name, bearing_slug FROM benchmark_aliases
      WHERE source = ${source}
    `
    for (const a of aliasRows) {
      aliasMap.set(`${source}::${a.source_model_name}`, a.bearing_slug as string)
    }
  }

  const sql = getDb()
  const unmatched = new Set<string>()
  let inserted = 0

  for (const r of rows) {
    const cohortKey = `${r.source}::${r.sourceCategory}::${r.snapshotDate}`
    const cohort = cohorts.get(cohortKey)!
    const range = cohort.max - cohort.min
    const linear = range > 0 ? (r.rawScore - cohort.min) / range : 1.0
    // A pre-computed score (absolute-curve sources) bypasses cohort scaling.
    const normalised = r.normalisedScore != null
      ? Math.max(0, Math.min(1, r.normalisedScore))
      : (r.lowerIsBetter ? 1 - linear : linear)
    const signalType = r.signalType ?? 'task'

    const bearingSlug = aliasMap.get(`${r.source}::${r.sourceModelName}`) ?? null
    if (!bearingSlug) unmatched.add(`${r.source}::${r.sourceModelName}`)

    await sql`
      INSERT INTO benchmark_snapshots (
        source, source_category, source_model_name, bearing_slug,
        raw_score, normalised_score, vote_count, snapshot_date, signal_type
      ) VALUES (
        ${r.source}, ${r.sourceCategory}, ${r.sourceModelName}, ${bearingSlug},
        ${r.rawScore}, ${normalised}, ${r.voteCount}, ${r.snapshotDate}, ${signalType}
      )
      ON CONFLICT (source, source_category, source_model_name, snapshot_date)
      DO UPDATE SET
        raw_score = EXCLUDED.raw_score,
        normalised_score = EXCLUDED.normalised_score,
        vote_count = EXCLUDED.vote_count,
        bearing_slug = EXCLUDED.bearing_slug,
        signal_type = EXCLUDED.signal_type,
        captured_at = now()
    `
    inserted++
  }

  return { inserted, unmatched: [...unmatched] }
}

/**
 * Fetch the latest normalised score per (bearing_slug, bearing_task) by
 * averaging across all source categories that map to that task.
 *
 * Returns a Map keyed by `${slug}::${task}` for O(1) lookup at scoring time.
 */
export async function getLatestBenchmarkScores(): Promise<Map<string, number>> {
  const rows = await getDb()`
    WITH latest AS (
      SELECT DISTINCT ON (source, source_category, bearing_slug)
        source, source_category, bearing_slug, normalised_score
      FROM benchmark_snapshots
      WHERE bearing_slug IS NOT NULL
        AND (signal_type = 'task' OR signal_type IS NULL)
      ORDER BY source, source_category, bearing_slug, snapshot_date DESC, captured_at DESC
    )
    SELECT source, source_category, bearing_slug, normalised_score
    FROM latest
  `

  // Bucket by (slug, task) and average.
  const buckets = new Map<string, number[]>()
  for (const row of rows) {
    const source = row.source as BenchmarkSource
    const cat = row.source_category as string
    const slug = row.bearing_slug as string
    const score = row.normalised_score as number
    const tasks = CATEGORY_TO_TASKS[source]?.[cat]
    if (!tasks) continue
    for (const task of tasks) {
      const key = `${slug}::${task}`
      const list = buckets.get(key) ?? []
      list.push(score)
      buckets.set(key, list)
    }
  }

  const result = new Map<string, number>()
  for (const [key, scores] of buckets) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length
    result.set(key, mean)
  }
  return result
}

/**
 * Latest non-task signals (speed, latency) per bearing slug, normalised 0..1
 * (higher = better, latency already inverted at ingest time).
 *
 * Returns a Map keyed by `${slug}::${signalType}`.
 */
export async function getLatestPerformanceSignals(): Promise<Map<string, number>> {
  const rows = await getDb()`
    SELECT DISTINCT ON (bearing_slug, source, signal_type)
      bearing_slug, source, signal_type, normalised_score
    FROM benchmark_snapshots
    WHERE bearing_slug IS NOT NULL AND signal_type <> 'task'
    ORDER BY bearing_slug, source, signal_type, snapshot_date DESC, captured_at DESC
  `

  // Bucket by (slug, signalType) and average across sources.
  const buckets = new Map<string, number[]>()
  for (const row of rows) {
    const key = `${row.bearing_slug}::${row.signal_type}`
    const list = buckets.get(key) ?? []
    list.push(row.normalised_score as number)
    buckets.set(key, list)
  }

  const result = new Map<string, number>()
  for (const [key, scores] of buckets) {
    result.set(key, scores.reduce((a, b) => a + b, 0) / scores.length)
  }
  return result
}

/** Admin summary: count rows per source, latest snapshot date, alias coverage. */
export async function getBenchmarkSummary(): Promise<{
  source: string
  totalRows: number
  matchedRows: number
  latestSnapshot: string | null
}[]> {
  const rows = await getDb()`
    SELECT
      source,
      COUNT(*)::int AS total_rows,
      COUNT(bearing_slug)::int AS matched_rows,
      MAX(snapshot_date)::text AS latest_snapshot
    FROM benchmark_snapshots
    GROUP BY source
    ORDER BY source
  `
  return rows.map(r => ({
    source: r.source as string,
    totalRows: r.total_rows as number,
    matchedRows: r.matched_rows as number,
    latestSnapshot: r.latest_snapshot as string | null,
  }))
}

/**
 * Source model names that appear in snapshots but have no alias mapping yet.
 * Returned with the highest vote_count we've seen for that name — useful for
 * deciding which to map first (most-voted models give us the best signal).
 */
export async function getUnmatchedSourceModels(): Promise<{
  source: string
  sourceModelName: string
  maxVoteCount: number | null
}[]> {
  const rows = await getDb()`
    SELECT source, source_model_name, MAX(vote_count) AS max_vote_count
    FROM benchmark_snapshots
    WHERE bearing_slug IS NULL
    GROUP BY source, source_model_name
    ORDER BY MAX(vote_count) DESC NULLS LAST, source_model_name
  `
  return rows.map(r => ({
    source: r.source as string,
    sourceModelName: r.source_model_name as string,
    maxVoteCount: r.max_vote_count as number | null,
  }))
}

export interface BenchmarkAlias {
  source: string
  sourceModelName: string
  bearingSlug: string
  notes: string | null
  createdAt: string
}

/** All aliases pointing at a given bearing slug, across all sources. */
export async function getAliasesForBearingSlug(bearingSlug: string): Promise<{
  source: BenchmarkSource
  sourceModelName: string
}[]> {
  const rows = await getDb()`
    SELECT source, source_model_name FROM benchmark_aliases WHERE bearing_slug = ${bearingSlug}
  `
  return rows.map(r => ({
    source: r.source as BenchmarkSource,
    sourceModelName: r.source_model_name as string,
  }))
}

/**
 * Distinct source_model_names ingested for a given source, with the
 * bearing_slug they're currently aliased to (if any). Used to populate the
 * import-modal alias-suggestion panel.
 */
export async function getCandidateSourceModelNames(source: BenchmarkSource): Promise<{
  sourceModelName: string
  existingAlias: string | null
}[]> {
  const rows = await getDb()`
    SELECT
      s.source_model_name,
      MAX(a.bearing_slug) AS existing_alias
    FROM benchmark_snapshots s
    LEFT JOIN benchmark_aliases a
      ON a.source = s.source AND a.source_model_name = s.source_model_name
    WHERE s.source = ${source}
    GROUP BY s.source_model_name
    ORDER BY s.source_model_name
  `
  return rows.map(r => ({
    sourceModelName: r.source_model_name as string,
    existingAlias: (r.existing_alias as string | null) ?? null,
  }))
}

export async function listAliases(): Promise<BenchmarkAlias[]> {
  const rows = await getDb()`
    SELECT source, source_model_name, bearing_slug, notes, created_at
    FROM benchmark_aliases
    ORDER BY source, source_model_name
  `
  return rows.map(r => ({
    source: r.source as string,
    sourceModelName: r.source_model_name as string,
    bearingSlug: r.bearing_slug as string,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
  }))
}

/**
 * Upsert an alias and back-fill bearing_slug on any existing snapshots that
 * match (source, source_model_name). Without the back-fill, freshly mapped
 * models would only become visible after the next ingest run.
 */
export async function upsertAlias(
  source: BenchmarkSource,
  sourceModelName: string,
  bearingSlug: string,
  notes: string | null = null,
): Promise<void> {
  const sql = getDb()
  await sql`
    INSERT INTO benchmark_aliases (source, source_model_name, bearing_slug, notes)
    VALUES (${source}, ${sourceModelName}, ${bearingSlug}, ${notes})
    ON CONFLICT (source, source_model_name)
    DO UPDATE SET bearing_slug = EXCLUDED.bearing_slug, notes = EXCLUDED.notes
  `
  await sql`
    UPDATE benchmark_snapshots
    SET bearing_slug = ${bearingSlug}
    WHERE source = ${source} AND source_model_name = ${sourceModelName}
  `
}

export async function deleteAlias(source: BenchmarkSource, sourceModelName: string): Promise<void> {
  const sql = getDb()
  await sql`
    DELETE FROM benchmark_aliases
    WHERE source = ${source} AND source_model_name = ${sourceModelName}
  `
  await sql`
    UPDATE benchmark_snapshots
    SET bearing_slug = NULL
    WHERE source = ${source} AND source_model_name = ${sourceModelName}
  `
}

/** Active registry models in the shape the alias matcher needs. */
export async function getActiveModelsForMatching(): Promise<BearingModelMeta[]> {
  const rows = await getDb()`
    SELECT slug, name, provider FROM models WHERE active = true
  `
  return rows.map(r => ({
    slug: r.slug as string,
    name: r.name as string,
    provider: r.provider as string,
  }))
}

/**
 * Auto-create aliases for unmatched source names that have an exact, unique
 * token-bag match against an active model (strict — see autoMatchSlug). Used by
 * re-ingest so confident matches don't pile up in the manual Unmatched queue;
 * anything ambiguous is deliberately left for a human to confirm.
 *
 * Returns the source model names that were auto-aliased. Idempotent — re-running
 * just re-upserts the same alias.
 */
export async function autoApplyAliases(
  source: BenchmarkSource,
  sourceModelNames: string[],
  models?: BearingModelMeta[],
): Promise<string[]> {
  if (sourceModelNames.length === 0) return []
  const activeModels = models ?? await getActiveModelsForMatching()
  const applied: string[] = []
  for (const name of sourceModelNames) {
    const slug = autoMatchSlug(name, activeModels)
    if (!slug) continue
    await upsertAlias(source, name, slug, 'auto-matched')
    applied.push(name)
  }
  return applied
}
