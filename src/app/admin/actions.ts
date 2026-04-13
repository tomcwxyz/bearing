'use server'

import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin, getAllModelsFromDb, getModelFromDb, upsertModel, deactivateModel } from '@/lib/db'
import type { Model } from '@/lib/registry'
import {
  getUsageSummary, getActivityOverTime, getModeBreakdown, getSignupsOverTime,
  getInsightsSummary, getTaskTypeDistribution, getModelLeaderboard,
  getOutcomeBreakdown, getCapabilityDemand,
  formatGranularity,
  type UsageSummary, type ActivityPoint, type ModeCount, type SignupPoint,
  type InsightsSummary, type TaskTypeCount, type LeaderboardEntry,
  type OutcomeBreakdown, type CapabilityDemand,
} from '@/lib/dashboard'

export type { UsageSummary, ActivityPoint, ModeCount, SignupPoint }
export type { InsightsSummary, TaskTypeCount, LeaderboardEntry, OutcomeBreakdown, CapabilityDemand }

async function requireAdmin(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  const admin = await isUserAdmin(user.id)
  if (!admin) throw new Error('Not authorised')
  return user.id
}

export async function listModelsAdmin(): Promise<Model[]> {
  await requireAdmin()
  return getAllModelsFromDb()
}

export async function getModelAdmin(slug: string): Promise<Model | null> {
  await requireAdmin()
  return getModelFromDb(slug)
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
