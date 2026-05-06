'use server'

import { readFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin, getAllModelsFromDb, getAllModelsForAdmin, getModelForAdmin, upsertModel, deactivateModel, updateModelPricing, getOpenRouterIds, type AdminModel } from '@/lib/db'
import { fetchOpenRouterModels, convertPricing, inferCapabilities, extractProvider, type OpenRouterModel } from '@/lib/openrouter'
import {
  getBenchmarkSummary, getUnmatchedSourceModels, listAliases, upsertAlias, deleteAlias,
  getCandidateSourceModelNames,
  type BenchmarkSource, type BenchmarkAlias,
} from '@/lib/benchmarks'
import {
  suggestBenchmarkAliases, groundFromAliases, CODE_CAPABILITY_THRESHOLD,
  type AliasSuggestion, type Provenance,
} from '@/lib/import-grounding'
import {
  getUsageSummary, getActivityOverTime, getModeBreakdown, getSignupsOverTime,
  getInsightsSummary, getTaskTypeDistribution, getModelLeaderboard,
  getOutcomeBreakdown, getCapabilityDemand,
  formatGranularity,
  type UsageSummary, type ActivityPoint, type ModeCount, type SignupPoint,
  type InsightsSummary, type TaskTypeCount, type LeaderboardEntry,
  type OutcomeBreakdown, type CapabilityDemand,
} from '@/lib/dashboard'
import type { DiscoverModel } from './types'

async function requireAdmin(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  const admin = await isUserAdmin(user.id)
  if (!admin) throw new Error('Not authorised')
  return user.id
}

export async function listModelsAdmin(): Promise<AdminModel[]> {
  await requireAdmin()
  return getAllModelsForAdmin()
}

export async function getModelAdmin(slug: string): Promise<AdminModel | null> {
  await requireAdmin()
  return getModelForAdmin(slug)
}

export async function saveModelAdmin(formData: FormData): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()

  try {
    const slug = formData.get('slug') as string
    const model = {
      slug,
      name: formData.get('name') as string,
      provider: formData.get('provider') as string,
      tier: formData.get('tier') as string,
      pricing: JSON.parse(formData.get('pricing') as string),
      context_window: parseInt(formData.get('context_window') as string, 10),
      capabilities: JSON.parse(formData.get('capabilities') as string),
      strengths: JSON.parse(formData.get('strengths') as string),
      weaknesses: JSON.parse(formData.get('weaknesses') as string),
      task_fitness: JSON.parse(formData.get('task_fitness') as string),
      speed_score: parseFloat(formData.get('speed_score') as string),
      privacy_score: parseFloat(formData.get('privacy_score') as string),
      transparency: JSON.parse(formData.get('transparency') as string),
      sustainability: JSON.parse(formData.get('sustainability') as string),
      active: formData.get('active') === 'true',
    }
    await upsertModel(model)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Save failed' }
  }
}

export async function deactivateModelAdmin(slug: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await deactivateModel(slug)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Deactivation failed' }
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function fetchUsageData(granularityRaw: string): Promise<{
  summary: UsageSummary
  activity: ActivityPoint[]
  modes: ModeCount[]
  signups: SignupPoint[]
}> {
  await requireAdmin()
  const granularity = formatGranularity(granularityRaw)
  const [summary, activity, modes, signups] = await Promise.all([
    getUsageSummary(),
    getActivityOverTime(granularity),
    getModeBreakdown(),
    getSignupsOverTime(granularity),
  ])
  return { summary, activity, modes, signups }
}

export async function fetchInsightsData(): Promise<{
  summary: InsightsSummary
  taskTypes: TaskTypeCount[]
  leaderboard: LeaderboardEntry[]
  outcomes: OutcomeBreakdown
  capabilities: CapabilityDemand
}> {
  await requireAdmin()
  const [summary, taskTypes, leaderboard, outcomes, capabilities] = await Promise.all([
    getInsightsSummary(),
    getTaskTypeDistribution(),
    getModelLeaderboard(),
    getOutcomeBreakdown(),
    getCapabilityDemand(),
  ])
  return { summary, taskTypes, leaderboard, outcomes, capabilities }
}

// ---------------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------------

/** Fetch OpenRouter models not in our DB, plus count of matched models. */
export async function fetchDiscoverData(): Promise<{
  newModels: DiscoverModel[]
  matchedCount: number
}> {
  await requireAdmin()
  const [orModels, existingIds] = await Promise.all([
    fetchOpenRouterModels(),
    getOpenRouterIds(),
  ])

  const newModels: DiscoverModel[] = []
  let matchedCount = 0

  for (const m of orModels) {
    if (existingIds.has(m.id)) {
      matchedCount++
      continue
    }
    // Skip free/test models and models without real pricing
    if (!m.pricing?.prompt || !m.pricing?.completion) continue

    const pricing = convertPricing(m.pricing.prompt, m.pricing.completion)
    newModels.push({
      id: m.id,
      name: m.name,
      provider: extractProvider(m.id),
      modality: m.architecture?.modality ?? 'text->text',
      contextWindow: m.context_length,
      pricing,
      capabilities: inferCapabilities(
        m.architecture?.input_modalities ?? ['text'],
        m.architecture?.output_modalities ?? ['text'],
        m.supported_parameters ?? [],
        m.context_length,
      ),
      description: m.description,
      supportedParameters: m.supported_parameters ?? [],
      created: m.created,
    })
  }

  // Sort newest first
  newModels.sort((a, b) => b.created - a.created)

  return { newModels, matchedCount }
}

/**
 * Estimate scores for a model. Grounded fields (task_fitness with benchmark
 * coverage, speed_score from AA, privacy_score from provider table) come
 * from deterministic computation; Haiku fills the rest with the grounded
 * evidence in its prompt for context.
 *
 * `selectedAliases` should be the same set of (source, source_model_name)
 * pairs the admin checked in the import modal — they need not be persisted
 * yet; we read directly from benchmark_snapshots.
 */
export async function estimateModelScores(
  model: DiscoverModel,
  selectedAliases: { source: BenchmarkSource; sourceModelName: string }[] = [],
): Promise<{
  success: boolean
  estimates?: Record<string, unknown>
  provenance?: Record<string, Provenance>
  error?: string
}> {
  await requireAdmin()

  try {
    const grounded = await groundFromAliases(selectedAliases, model.provider)

    const promptPath = join(process.cwd(), 'src', 'prompts', 'estimate-model.md')
    const systemPrompt = readFileSync(promptPath, 'utf-8')

    const metadata = [
      `Name: ${model.name}`,
      `Provider: ${model.provider}`,
      `OpenRouter ID: ${model.id}`,
      `Modality: ${model.modality}`,
      `Context window: ${model.contextWindow.toLocaleString()} tokens`,
      `Pricing: $${model.pricing.input_per_1m}/M input, $${model.pricing.output_per_1m}/M output`,
      `Capabilities: ${model.capabilities.join(', ') || 'none detected'}`,
      `Description: ${model.description || 'No description available'}`,
    ].join('\n')

    // Build a "GROUNDED FIELDS" block listing fields that are already
    // deterministic so Haiku does not estimate them. Provided as context
    // (so transparency notes etc. can reference benchmark numbers) but the
    // returned values are merged from `grounded`, not Haiku's response.
    const groundedLines: string[] = []
    for (const [task, gf] of Object.entries(grounded.taskFitness)) {
      if (!gf) continue
      groundedLines.push(`- task_fitness.${task} = ${gf.value} (from ${gf.evidence?.join(', ')})`)
    }
    if (grounded.speedScore) {
      groundedLines.push(`- speed_score = ${grounded.speedScore.value} (from ${grounded.speedScore.evidence?.join(', ')})`)
    }
    groundedLines.push(`- privacy_score = ${grounded.privacyScore.value} (provider-table lookup)`)
    groundedLines.push(`- transparency.open_weights = ${grounded.openWeights.value} (provider-table lookup)`)
    groundedLines.push(`- transparency.transparency_score = ${grounded.baselineTransparency.value} (provider baseline; refine sub-fields but keep this anchor)`)

    const groundedBlock = `\n\n## GROUNDED FIELDS — DO NOT OVERRIDE\nThe following fields are computed from benchmark data. Do not produce estimates for them in your output; they will be merged in deterministically.\n${groundedLines.join('\n')}\n${grounded.evidenceForPrompt.length ? `\nFull evidence:\n${grounded.evidenceForPrompt.map(l => `- ${l}`).join('\n')}` : ''}`

    const anthropic = new Anthropic()
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt + groundedBlock,
      messages: [{ role: 'user', content: metadata }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const haikuOutput = JSON.parse(cleaned) as Record<string, unknown>

    // Merge grounded over Haiku output. Track provenance per top-level field.
    const provenance: Record<string, Provenance> = {}
    const taskFitness: Record<string, number> = {
      ...(haikuOutput.task_fitness as Record<string, number> ?? {}),
    }
    for (const [task, gf] of Object.entries(grounded.taskFitness)) {
      if (!gf) continue
      taskFitness[task] = gf.value
      provenance[`task_fitness.${task}`] = 'benchmark'
    }
    for (const task of Object.keys(taskFitness)) {
      if (!provenance[`task_fitness.${task}`]) provenance[`task_fitness.${task}`] = 'haiku'
    }

    let speedScore = haikuOutput.speed_score as number | undefined
    if (grounded.speedScore) {
      speedScore = grounded.speedScore.value
      provenance.speed_score = 'benchmark'
    } else if (typeof speedScore === 'number') {
      provenance.speed_score = 'haiku'
    }

    const privacyScore = grounded.privacyScore.value
    provenance.privacy_score = grounded.privacyScore.provenance

    // Merge grounded transparency anchors. Keep Haiku's sub-fields and notes
    // but force open_weights and transparency_score to the provider lookup.
    const haikuTransparency = (haikuOutput.transparency as Record<string, unknown> | undefined) ?? {}
    const transparency = {
      ...haikuTransparency,
      open_weights: grounded.openWeights.value,
      transparency_score: grounded.baselineTransparency.value,
    }
    provenance['transparency.open_weights'] = grounded.openWeights.provenance
    provenance['transparency.transparency_score'] = grounded.baselineTransparency.provenance

    // Derived capability: `code` if grounded task_fitness.code clears the threshold.
    const groundedCode = grounded.taskFitness.code
    const derivedCodeCap = groundedCode != null && groundedCode.value >= CODE_CAPABILITY_THRESHOLD

    const estimates: Record<string, unknown> = {
      ...haikuOutput,
      task_fitness: taskFitness,
      speed_score: speedScore,
      privacy_score: privacyScore,
      transparency,
      // Surfaced for the UI to merge into formData.capabilities; not a registry field itself.
      derived_capabilities: { code: derivedCodeCap },
    }

    // Remaining Haiku-only fields get 'haiku' provenance.
    for (const k of ['tier', 'sustainability', 'strengths', 'weaknesses']) {
      if (k in estimates) provenance[k] = 'haiku'
    }

    return { success: true, estimates, provenance }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Estimation failed' }
  }
}

/** Import a model as a draft (active=false). Optionally writes selected
 *  benchmark aliases AFTER the model row is upserted (FK requires it). */
export async function importModel(formData: FormData): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()

  try {
    const model = {
      slug: formData.get('slug') as string,
      name: formData.get('name') as string,
      provider: formData.get('provider') as string,
      tier: formData.get('tier') as string,
      pricing: JSON.parse(formData.get('pricing') as string),
      context_window: parseInt(formData.get('context_window') as string, 10),
      capabilities: JSON.parse(formData.get('capabilities') as string),
      strengths: JSON.parse(formData.get('strengths') as string),
      weaknesses: JSON.parse(formData.get('weaknesses') as string),
      task_fitness: JSON.parse(formData.get('task_fitness') as string),
      speed_score: parseFloat(formData.get('speed_score') as string),
      privacy_score: parseFloat(formData.get('privacy_score') as string),
      transparency: JSON.parse(formData.get('transparency') as string),
      sustainability: JSON.parse(formData.get('sustainability') as string),
      openrouter_id: formData.get('openrouter_id') as string,
      active: false,
    }
    await upsertModel(model)

    const aliasesRaw = formData.get('selected_aliases') as string | null
    if (aliasesRaw) {
      const aliases = JSON.parse(aliasesRaw) as Array<{ source: BenchmarkSource; sourceModelName: string }>
      for (const a of aliases) {
        await upsertAlias(a.source, a.sourceModelName, model.slug, 'confirmed during import')
      }
    }

    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Import failed' }
  }
}

export type SuggestionsBySource = Record<BenchmarkSource, (AliasSuggestion & { existingAlias: string | null })[]>

/**
 * Run the alias matcher across all benchmark sources for a model being
 * imported. Returns up to 10 candidates per source, ranked by the matcher
 * (unflagged first, then by score). Existing aliases are surfaced so the
 * admin can avoid accidentally rewriting them.
 */
export async function suggestAliasesForImport(input: {
  slug: string
  name: string
  provider: string
}): Promise<SuggestionsBySource> {
  await requireAdmin()

  const sources: BenchmarkSource[] = ['lmarena', 'livebench', 'artificialanalysis']
  const result: SuggestionsBySource = { lmarena: [], livebench: [], artificialanalysis: [] }

  for (const source of sources) {
    const candidates = await getCandidateSourceModelNames(source)
    const suggestions = suggestBenchmarkAliases(
      { slug: input.slug, name: input.name, provider: input.provider },
      source,
      candidates.map(c => ({ name: c.sourceModelName })),
    )
    const aliasLookup = new Map(candidates.map(c => [c.sourceModelName, c.existingAlias]))
    result[source] = suggestions.slice(0, 10).map(s => ({
      ...s,
      existingAlias: aliasLookup.get(s.name) ?? null,
    }))
  }

  return result
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

export interface BenchmarksData {
  summary: { source: string; totalRows: number; matchedRows: number; latestSnapshot: string | null }[]
  aliases: BenchmarkAlias[]
  unmatched: { source: string; sourceModelName: string; maxVoteCount: number | null }[]
}

export async function fetchBenchmarksData(): Promise<BenchmarksData> {
  await requireAdmin()
  const [summary, aliases, unmatched] = await Promise.all([
    getBenchmarkSummary(),
    listAliases(),
    getUnmatchedSourceModels(),
  ])
  return { summary, aliases, unmatched }
}

export async function addBenchmarkAlias(
  source: string, sourceModelName: string, bearingSlug: string, notes: string | null,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await upsertAlias(source as BenchmarkSource, sourceModelName, bearingSlug, notes)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Add alias failed' }
  }
}

export async function removeBenchmarkAlias(
  source: string, sourceModelName: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await deleteAlias(source as BenchmarkSource, sourceModelName)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Remove alias failed' }
  }
}

/** Sync pricing from OpenRouter for all matched models. */
export async function syncPricing(): Promise<{ updated: number; unchanged: number; errors: string[] }> {
  await requireAdmin()

  const [orModels, existingIds] = await Promise.all([
    fetchOpenRouterModels(),
    getOpenRouterIds(),
  ])

  // Build lookup: openrouter_id → OpenRouter model
  const orLookup = new Map<string, OpenRouterModel>()
  for (const m of orModels) {
    orLookup.set(m.id, m)
  }

  // Get current pricing for matched models
  const allModels = await getAllModelsFromDb()
  let updated = 0
  let unchanged = 0
  const errors: string[] = []

  for (const [orId, slug] of existingIds) {
    const orModel = orLookup.get(orId)
    if (!orModel) continue

    const newPricing = convertPricing(orModel.pricing.prompt, orModel.pricing.completion)
    const existing = allModels.find(m => m.slug === slug)
    if (!existing) continue

    // Only update if pricing actually changed
    if (
      Math.abs(existing.pricing.input_per_1m - newPricing.input_per_1m) > 0.001 ||
      Math.abs(existing.pricing.output_per_1m - newPricing.output_per_1m) > 0.001
    ) {
      try {
        await updateModelPricing(slug, newPricing)
        updated++
      } catch (err: unknown) {
        errors.push(`${slug}: ${err instanceof Error ? err.message : 'update failed'}`)
      }
    } else {
      unchanged++
    }
  }

  return { updated, unchanged, errors }
}
