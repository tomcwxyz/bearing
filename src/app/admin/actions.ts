'use server'

import { readFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin, getAllModelsFromDb, getAllModelsForAdmin, getModelForAdmin, upsertModel, deactivateModel, updateModelPricing, getOpenRouterIds, type AdminModel } from '@/lib/db'
import { fetchOpenRouterModels, convertPricing, inferCapabilities, extractProvider, type OpenRouterModel } from '@/lib/openrouter'
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

/** Use Haiku to estimate scores for a model based on its metadata. */
export async function estimateModelScores(model: DiscoverModel): Promise<{
  success: boolean
  estimates?: Record<string, unknown>
  error?: string
}> {
  await requireAdmin()

  try {
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

    const anthropic = new Anthropic()
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: metadata }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const estimates = JSON.parse(cleaned)
    return { success: true, estimates }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Estimation failed' }
  }
}

/** Import a model as a draft (active=false). */
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
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Import failed' }
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
