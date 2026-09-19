import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { priorityToWeights } from '@/lib/weights'
import type { Factor } from '@/lib/registry'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format') || 'json'

  const sql = getDb()

  // Fetch latest recommendation per (task, rank) for every task that reached
  // the recommendation stage. Recommendations are written every time recommend
  // runs, so the same (task_id, rank) can appear many times; we keep the most
  // recent. Pipeline-mode tasks may have no recommendations row — those are
  // still included via the LEFT JOIN below.
  const recs = await sql`
    SELECT DISTINCT ON (r.task_id, r.rank)
      r.task_id,
      r.model_slug,
      r.rank,
      r.weighted_score
    FROM recommendations r
    ORDER BY r.task_id, r.rank, r.created_at DESC
  `

  // Local-inference recommendations (open-weight models for local hardware).
  // Same dedupe pattern: a fresh set is written on every visit to the results
  // page, so we keep the latest per (task_id, rank). Tasks with no viable
  // local candidates have zero rows here — absence means "no local rec",
  // not "data missing". Pre-2026-05-23 tasks have zero rows because the
  // local set was computed but not persisted.
  const localRecs = await sql`
    SELECT DISTINCT ON (l.task_id, l.rank)
      l.task_id, l.model_slug, l.rank, l.effective_quality,
      l.quant, l.vram_gb, l.quality_penalty, l.hardware_tier_id
    FROM local_recommendations l
    ORDER BY l.task_id, l.rank, l.created_at DESC
  `

  const modelCatalogue = await sql`
    SELECT slug, model_class, transparency, local_info FROM models
  `
  const catalogueBySlug = new Map<string, {
    model_class: string
    open_weights: number
    is_open_weight: boolean
    local_capable: boolean
  }>()
  for (const m of modelCatalogue) {
    const transparency = m.transparency as Record<string, unknown> | null
    const openWeights = Number(transparency?.open_weights ?? 0)
    catalogueBySlug.set(m.slug as string, {
      model_class: m.model_class as string,
      open_weights: Number.isFinite(openWeights) ? openWeights : 0,
      is_open_weight: Number.isFinite(openWeights) && openWeights >= 0.8,
      local_capable: Boolean(m.local_info),
    })
  }

  const recsByTask = new Map<string, Array<{
    slug: string
    rank: number
    weighted_score: number
    model_class: string
    open_weights: number
    is_open_weight: boolean
    local_capable: boolean
  }>>()
  for (const r of recs) {
    const taskId = r.task_id as string
    if (!recsByTask.has(taskId)) recsByTask.set(taskId, [])
    const catalogue = catalogueBySlug.get(r.model_slug as string)
    recsByTask.get(taskId)!.push({
      slug: r.model_slug as string,
      rank: r.rank as number,
      weighted_score: r.weighted_score as number,
      model_class: catalogue?.model_class ?? 'chat',
      open_weights: catalogue?.open_weights ?? 0,
      is_open_weight: catalogue?.is_open_weight ?? false,
      local_capable: catalogue?.local_capable ?? false,
    })
  }

  const localByTask = new Map<string, Array<{
    slug: string
    rank: number
    effective_quality: number
    quant: string
    vram_gb: number
    quality_penalty: number
    hardware_tier_id: string
    model_class: string
  }>>()
  for (const l of localRecs) {
    const taskId = l.task_id as string
    if (!localByTask.has(taskId)) localByTask.set(taskId, [])
    localByTask.get(taskId)!.push({
      slug: l.model_slug as string,
      rank: l.rank as number,
      effective_quality: l.effective_quality as number,
      quant: l.quant as string,
      vram_gb: l.vram_gb as number,
      quality_penalty: l.quality_penalty as number,
      hardware_tier_id: l.hardware_tier_id as string,
      model_class: catalogueBySlug.get(l.model_slug as string)?.model_class ?? 'chat',
    })
  }

  // Every task that reached recommendation OR has a pipeline plan is a
  // "Bearing use" worth exporting — even if the user never selected a model.
  // selections + outcomes are deduped to the latest row per task (selections
  // accumulate on revisit; outcomes don't dup today but we guard against it).
  const rowsWithId = await sql`
    WITH latest_selection AS (
      SELECT DISTINCT ON (task_id)
        task_id, model_slug, recommended_rank,
        model_metadata_snapshot, choice_context, created_at
      FROM selections
      ORDER BY task_id, created_at DESC
    ),
    latest_outcome AS (
      SELECT DISTINCT ON (task_id) task_id, success, failure_reason, created_at
      FROM outcomes
      ORDER BY task_id, created_at DESC
    )
    SELECT
      t.id AS task_id,
      t.task_type,
      t.task_subtype,
      t.complexity,
      t.input_length,
      t.needs_vision,
      t.needs_tools,
      t.needs_code,
      t.needs_reasoning,
      t.is_recurring,
      t.data_sensitivity,
      t.latency_target,
      t.volume,
      t.needs_long_context,
      t.needs_multilingual,
      t.is_agentic,
      t.output_length,
      t.priority_order,
      t.excluded_factors,
      t.pipeline_stages,
      t.mode,
      t.classification_schema_version,
      t.created_at::date AS task_date,
      s.model_slug   AS selected_model,
      s.recommended_rank,
      s.model_metadata_snapshot AS selected_model_metadata,
      s.choice_context AS selection_choice_context,
      o.success      AS outcome_success,
      o.failure_reason
    FROM tasks t
    LEFT JOIN latest_selection s ON s.task_id = t.id
    LEFT JOIN latest_outcome   o ON o.task_id = t.id
    WHERE EXISTS (SELECT 1 FROM recommendations WHERE task_id = t.id)
       OR t.pipeline_stages IS NOT NULL
    ORDER BY t.created_at DESC
  `

  const executionRows = await sql`
    SELECT
      task_id,
      model_slug,
      model_metadata_snapshot,
      execution_location,
      execution_purpose,
      runtime,
      runtime_version,
      runtime_model_id,
      quant,
      context_length,
      hardware_profile,
      measured_vram_gb,
      tokens_per_second,
      latency_ms,
      prompt_tokens,
      output_tokens,
      total_duration_ms,
      load_duration_ms,
      prompt_eval_duration_ms,
      evidence_source,
      created_at::date AS execution_date
    FROM execution_observations
    ORDER BY created_at
  `

  const executionsByTask = new Map<string, Array<Record<string, unknown>>>()
  for (const observation of executionRows) {
    const taskId = observation.task_id as string
    if (!executionsByTask.has(taskId)) executionsByTask.set(taskId, [])
    executionsByTask.get(taskId)!.push({
      model_slug: observation.model_slug,
      model_metadata: observation.model_metadata_snapshot ?? null,
      execution_location: observation.execution_location,
      execution_purpose: observation.execution_purpose,
      runtime: observation.runtime ?? null,
      runtime_version: observation.runtime_version ?? null,
      runtime_model_id: observation.runtime_model_id ?? null,
      quant: observation.quant ?? null,
      context_length: observation.context_length ?? null,
      hardware_profile: observation.hardware_profile ?? null,
      measured_vram_gb: observation.measured_vram_gb ?? null,
      tokens_per_second: observation.tokens_per_second ?? null,
      latency_ms: observation.latency_ms ?? null,
      prompt_tokens: observation.prompt_tokens ?? null,
      output_tokens: observation.output_tokens ?? null,
      total_duration_ms: observation.total_duration_ms ?? null,
      load_duration_ms: observation.load_duration_ms ?? null,
      prompt_eval_duration_ms: observation.prompt_eval_duration_ms ?? null,
      evidence_source: observation.evidence_source,
      execution_date: observation.execution_date,
    })
  }

  const records = rowsWithId.map((row) => {
    const priorityOrder = (row.priority_order as Factor[] | null) ?? []
    const excludedFactors = (row.excluded_factors as string[] | null) ?? []
    // Recompute the weights the user's priority order produced. The complexity
    // boost is folded in so the published weights match what the recommender
    // actually applied. Returns 0 for excluded factors (they're zeroed before
    // normalisation), making this the canonical "what mattered to the user".
    const factorWeights = priorityOrder.length
      ? priorityToWeights(priorityOrder, {
          complexity: row.complexity as string | undefined,
          excludedFactors,
        })
      : null

    return {
      task_type: row.task_type,
      task_subtype: row.task_subtype,
      complexity: row.complexity,
      input_length: row.input_length,
      needs_vision: row.needs_vision,
      needs_tools: row.needs_tools,
      needs_code: row.needs_code,
      needs_reasoning: row.needs_reasoning,
      is_recurring: row.is_recurring,
      data_sensitivity: row.data_sensitivity,
      latency_target: row.latency_target,
      volume: row.volume,
      needs_long_context: row.needs_long_context,
      needs_multilingual: row.needs_multilingual,
      is_agentic: row.is_agentic,
      output_length: row.output_length,
      mode: row.mode,
      priority_order: priorityOrder,
      excluded_factors: excludedFactors,
      factor_weights: factorWeights,
      pipeline_stages: row.pipeline_stages ?? null,
      classification_schema_version: row.classification_schema_version,
      models_recommended: recsByTask.get(row.task_id as string) ?? [],
      local_recommendations: localByTask.get(row.task_id as string) ?? [],
      model_selected: row.selected_model
        ? {
            slug: row.selected_model,
            recommended_rank: row.recommended_rank,
            model_metadata: row.selected_model_metadata ?? null,
            choice_context: row.selection_choice_context ?? null,
          }
        : null,
      execution_observations: executionsByTask.get(row.task_id as string) ?? [],
      outcome_success: row.outcome_success ?? null,
      failure_reason: row.failure_reason ?? null,
      task_date: row.task_date,
    }
  })

  const headers = {
    'Cache-Control': 'public, max-age=3600',
  }

  if (format === 'csv') {
    const csvHeaders = [
      'task_type',
      'task_subtype',
      'complexity',
      'input_length',
      'needs_vision',
      'needs_tools',
      'needs_code',
      'needs_reasoning',
      'is_recurring',
      'data_sensitivity',
      'latency_target',
      'volume',
      'needs_long_context',
      'needs_multilingual',
      'is_agentic',
      'output_length',
      'mode',
      'priority_order',
      'excluded_factors',
      'factor_weights',
      'pipeline_stages',
      'classification_schema_version',
      'models_recommended',
      'local_recommendations',
      'selected_model',
      'selected_recommended_rank',
      'selected_model_metadata',
      'selection_choice_context',
      'execution_observations',
      'outcome_success',
      'failure_reason',
      'task_date',
    ]

    const csvRows = records.map((r) =>
      [
        esc(r.task_type),
        esc(r.task_subtype),
        esc(r.complexity),
        esc(r.input_length),
        r.needs_vision,
        r.needs_tools,
        r.needs_code,
        r.needs_reasoning,
        r.is_recurring,
        esc(r.data_sensitivity),
        esc(r.latency_target),
        esc(r.volume),
        r.needs_long_context,
        r.needs_multilingual,
        r.is_agentic,
        esc(r.output_length),
        esc(r.mode),
        esc(JSON.stringify(r.priority_order)),
        esc(JSON.stringify(r.excluded_factors)),
        esc(r.factor_weights ? JSON.stringify(r.factor_weights) : ''),
        esc(r.pipeline_stages ? JSON.stringify(r.pipeline_stages) : ''),
        esc(r.classification_schema_version),
        esc(JSON.stringify(r.models_recommended)),
        esc(JSON.stringify(r.local_recommendations)),
        esc(r.model_selected?.slug),
        r.model_selected?.recommended_rank ?? '',
        esc(r.model_selected?.model_metadata ? JSON.stringify(r.model_selected.model_metadata) : ''),
        esc(r.model_selected?.choice_context ? JSON.stringify(r.model_selected.choice_context) : ''),
        esc(JSON.stringify(r.execution_observations)),
        r.outcome_success,
        esc(r.failure_reason),
        esc(r.task_date),
      ].join(','),
    )

    const csv = [csvHeaders.join(','), ...csvRows].join('\n')

    return new NextResponse(csv, {
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bearing-dataset.csv"',
      },
    })
  }

  return NextResponse.json(
    {
      meta: {
        name: 'Bearing Public Dataset',
        version: '2.1',
        exported_at: new Date().toISOString(),
        record_count: records.length,
        description:
          'Anonymised task-to-model decision data from Bearing. One row per task that reached the recommendation stage, with recommendation, selection, openness/local context and observed execution evidence kept distinct.',
        licence: 'CC BY-NC 4.0',
        // Each record carries the classification_schema_version under which
        // task_type was assigned. Filter or interpret accordingly.
        classification_schema_versions: {
          'v0.7': {
            task_types: ['summarise', 'extract', 'generate', 'code', 'analyse', 'translate', 'conversation', 'vision', 'other'],
            note: 'Used for all tasks classified before 2026-05-19.',
          },
          'v0.8': {
            task_types: ['summarise', 'extract', 'generate', 'comms', 'code', 'math', 'reasoning', 'analyse', 'research', 'qa', 'translate', 'conversation'],
            note: 'Used for tasks classified on or after 2026-05-19. Removed `vision` (now a capability only) and `other` (replaced by clarification flow). Added `comms`, `math`, `reasoning`, `research`, `qa`.',
          },
          'v0.9': {
            task_types: ['summarise', 'extract', 'generate', 'comms', 'code', 'math', 'reasoning', 'analyse', 'research', 'qa', 'translate', 'conversation', 'embedding'],
            note: 'Used for tasks classified on or after 2026-05-29. Adds `embedding` as the 13th task type for vector-producing pipeline stages and dedicated embedding requests. New tasks also carry mode="embedding" when submitted via the /embedding entry point.',
          },
        },
        changelog: {
          '2.1': 'Adds execution_purpose plus runtime version and detailed measured probe metrics (prompt/output tokens, total/load/prompt-eval durations) so verification probes can be analysed separately from real task executions.',
          '2.0': 'Adds the full current task-classification dimensions; adds openness/local-capability metadata to recommended models; expands model_selected with a selection-time model metadata snapshot and privacy-safe choice context (active filters, coarse hardware profile, predicted hardware fit); adds execution_observations for actual runtime evidence such as local runtime, quant, context, VRAM and tokens/sec. Choice/fit evidence and observed execution are intentionally separate.',
          '1.4': 'Adds model_class to every entry in models_recommended and local_recommendations ("chat" or "embedding"). Adds v0.9 classification_schema_version with the 13-value task type enum.',
          '1.3': 'Adds local_recommendations — the open-weight models the recommender suggested for local hardware, with quant / VRAM / hardware tier per candidate. Persisted from 2026-05-23; empty array for earlier tasks.',
          '1.2': 'Includes every task that reached the recommendation stage (not just tasks with a selection). Adds excluded_factors, factor_weights (normalised per-factor weights actually applied by the recommender), pipeline_stages (the classifier-produced multi-stage plan when one was generated), and mode (recommend / pipeline / validate). model_selected is now nullable.',
          '1.1': 'Adds classification_schema_version per row + per-version task_type enum docs.',
          '1.0': 'Initial release.',
        },
        fields: {
          task_type: 'Primary task category (see classification_schema_versions for the valid set per row)',
          task_subtype: 'More specific task category',
          complexity: 'Estimated complexity: low, medium, high',
          input_length: 'Estimated input length: short, medium, long, very_long',
          needs_vision: 'Whether the task requires vision/image capabilities',
          needs_tools: 'Whether the task requires tool use / function calling',
          needs_code: 'Whether the task requires code generation or execution',
          needs_reasoning: 'Whether the task requires multi-step reasoning / extended thinking',
          is_recurring: 'Whether this is a recurring/repeated task',
          data_sensitivity: 'Task data-sensitivity class used by privacy/on-prem routing',
          latency_target: 'Task latency target such as realtime, interactive or batch',
          volume: 'Expected task volume',
          needs_long_context: 'Whether the task requires a long context window',
          needs_multilingual: 'Whether the task requires multilingual capability',
          is_agentic: 'Whether the task is an agentic/multi-step tool-using workload',
          output_length: 'Estimated output length: short, medium, long, very_long',
          mode: 'Bearing mode used: "recommend", "pipeline", or "validate"',
          priority_order: 'User-ranked priority factors in order of importance',
          excluded_factors: 'Factors the user explicitly opted out of (force zero weight)',
          factor_weights: 'Normalised per-factor weights actually applied by the recommender (after complexity boost + low-priority damping + exclusion zeroing). null if the user did not provide a priority order.',
          pipeline_stages: 'Classifier-produced multi-stage pipeline plan when one was recommended; null otherwise',
          classification_schema_version: 'Which version of the task-type enum was used to assign task_type — v0.7, v0.8, or v0.9',
          models_recommended: 'Array of {slug, rank, weighted_score, model_class, open_weights, is_open_weight, local_capable}. Openness/local fields reflect the catalogue at export time; selection-time state is snapshotted separately in model_selected.model_metadata.',
          local_recommendations: 'Array of {slug, rank, effective_quality, quant, vram_gb, quality_penalty, hardware_tier_id, model_class} for open-weight models recommendable on local hardware. model_class is "chat" or "embedding". Empty array means either no viable local candidate OR (for tasks before 2026-05-23) that the local set was computed but not persisted.',
          model_selected: '{slug, recommended_rank, model_metadata, choice_context} for the chosen model. model_metadata is snapshotted at selection time for new choices; older rows are explicitly marked as backfilled from the current catalogue. choice_context may include the filters active when chosen, a coarse hardware profile and predicted fit. null if no selection was made.',
          execution_observations: 'Array of actual execution observations. Kept separate from predicted hardware fit. execution_purpose distinguishes task_execution from verification_probe. Observations may include runtime/version, quant, context_length, coarse hardware, measured_vram_gb, tokens_per_second, latency, token counts, detailed duration metrics and evidence_source.',
          outcome_success: 'Whether the user reported success (true/false/null)',
          failure_reason: 'User-reported failure reason if applicable',
          task_date: 'Date the task was created',
        },
      },
      records,
    },
    { headers },
  )
}

/** Escape a value for CSV: wrap in quotes if it contains commas, quotes, or newlines. */
function esc(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}
