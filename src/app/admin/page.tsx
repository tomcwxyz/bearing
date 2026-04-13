import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin, getAllModelsFromDb, getOpenRouterIds } from '@/lib/db'
import {
  getUsageSummary, getActivityOverTime, getModeBreakdown, getSignupsOverTime,
  getInsightsSummary, getTaskTypeDistribution, getModelLeaderboard,
  getOutcomeBreakdown, getCapabilityDemand,
} from '@/lib/dashboard'
import { fetchOpenRouterModels, convertPricing, inferCapabilities, extractProvider } from '@/lib/openrouter'
import AdminTabs from './admin-tabs'
import type { DiscoverModel } from './actions'

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')

  const admin = await isUserAdmin(user.id)
  if (!admin) redirect('/')

  const [
    models,
    usageSummary, activity, modes, signups,
    insightsSummary, taskTypes, leaderboard, outcomes, capabilities,
    orModels, existingIds,
  ] = await Promise.all([
    getAllModelsFromDb(),
    getUsageSummary(),
    getActivityOverTime('day'),
    getModeBreakdown(),
    getSignupsOverTime('day'),
    getInsightsSummary(),
    getTaskTypeDistribution(),
    getModelLeaderboard(),
    getOutcomeBreakdown(),
    getCapabilityDemand(),
    fetchOpenRouterModels().catch(() => []),
    getOpenRouterIds(),
  ])

  // Build discover data: OpenRouter models not in our DB
  const newModels: DiscoverModel[] = []
  let matchedCount = 0
  for (const m of orModels) {
    if (existingIds.has(m.id)) {
      matchedCount++
      continue
    }
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
  newModels.sort((a, b) => b.created - a.created)

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <h1 className="font-display text-4xl text-navy">Admin</h1>

        <AdminTabs
          models={models}
          initialDiscover={{ newModels, matchedCount }}
          initialUsage={{ summary: usageSummary, activity, modes, signups }}
          initialInsights={{ summary: insightsSummary, taskTypes, leaderboard, outcomes, capabilities }}
        />
      </div>
    </div>
  )
}
