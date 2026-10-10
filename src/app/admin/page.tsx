import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { getAllModelsForAdmin, getOpenRouterIds } from '@/db/models'
import { isUserAdmin } from '@/db/users'
import { getModelVerificationSummaries } from '@/db/model-verification'
import { getRoutabilitySummaries } from '@/db/model-routability'
import {
  getUsageSummary, getActivityOverTime, getModeBreakdown, getSignupsOverTime,
  getInsightsSummary, getTaskTypeDistribution, getModelLeaderboard,
  getOutcomeBreakdown, getCapabilityDemand, getLocalFitCalibration,
} from '@/lib/dashboard'
import { fetchOpenRouterModels, convertPricing, inferCapabilities, extractProvider } from '@/lib/openrouter'
import { getBenchmarkSummary, getUnmatchedSourceModels, listAliases } from '@/lib/benchmarks'
import { rankSlugs } from '@/lib/alias-matching'
import { getDiscoverBenchmarkNames } from '@/db/discover-benchmark'
import { assessDiscoverCoverage } from '@/lib/discover-coverage'
import { latestLmArenaRuns } from '@/db/benchmark-refresh-runs'
import { listDraftPublishMeta } from '@/db/draft-publishing'
import AdminTabs from './admin-tabs'
import type { DiscoverModel } from './types'

// Live benchmark re-ingest (reingestSource server action) runs on this route's
// function. LMArena paginates 3 subsets with paced sleeps, so the default
// serverless timeout is too short — give admin actions headroom.
export const maxDuration = 300

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')

  const admin = await isUserAdmin(user.id)
  if (!admin) redirect('/')

  const [
    models, verification, routability,
    usageSummary, activity, modes, signups,
    insightsSummary, taskTypes, leaderboard, outcomes, capabilities, localFitCalibration,
    orModels, existingIds,
    benchmarkSummary, benchmarkAliases, benchmarkUnmatched, discoverBenchmarkNames,
    refreshRuns, draftPublishMeta,
  ] = await Promise.all([
    getAllModelsForAdmin(),
    // Keep admin usable while migration 026 is being rolled out. Once the
    // columns exist this returns one lightweight freshness row per model.
    getModelVerificationSummaries().catch(() => []),
    getRoutabilitySummaries().catch(() => []),
    getUsageSummary(),
    getActivityOverTime('day'),
    getModeBreakdown(),
    getSignupsOverTime('day'),
    getInsightsSummary(),
    getTaskTypeDistribution(),
    getModelLeaderboard(),
    getOutcomeBreakdown(),
    getCapabilityDemand(),
    getLocalFitCalibration().catch(() => ({
      summary: {
        totalProbes: 0,
        measuredVram: 0,
        predictedFit: 0,
        succeededDespiteNoFit: 0,
        avgVramDeltaGb: null,
      },
      observations: [],
    })),
    fetchOpenRouterModels().catch(() => []),
    getOpenRouterIds(),
    getBenchmarkSummary().catch(() => []),
    listAliases().catch(() => []),
    getUnmatchedSourceModels().catch(() => []),
    getDiscoverBenchmarkNames().catch(() => null),
    latestLmArenaRuns().catch(() => []),
    listDraftPublishMeta().catch(() => []),
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
        m.context_length,
      ),
      description: m.description,
      supportedParameters: m.supported_parameters ?? [],
      created: m.created,
    })
  }
  newModels.sort((a, b) => b.created - a.created)
  if (discoverBenchmarkNames) {
    const coverage = assessDiscoverCoverage(newModels, discoverBenchmarkNames)
    for (const model of newModels) model.benchmark = coverage[model.id]
  }

  // Pre-rank slug suggestions for each unmatched source model (same logic as
  // fetchBenchmarksData) so the Benchmarks tab shows guesses on first render.
  const matchModels = models
    .filter(m => m.active)
    .map(m => ({ slug: m.slug, name: m.name, provider: m.provider }))
  const benchmarkUnmatchedWithSuggestions = benchmarkUnmatched.map(u => ({
    ...u,
    suggestions: rankSlugs(u.sourceModelName, matchModels)
      .slice(0, 5)
      .map(r => ({ slug: r.slug, confidence: r.confidence, flags: r.flags })),
  }))

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <h1 className="font-display text-4xl text-navy">Admin</h1>
        <Link href="/admin/evidence-proposals" className="mt-3 inline-block text-sm font-medium text-teal hover:underline">Community model evidence →</Link>

        <AdminTabs
          models={models}
          verification={verification}
          draftPublishMeta={draftPublishMeta}
          initialDiscover={{ newModels, matchedCount }}
          initialUsage={{ summary: usageSummary, activity, modes, signups }}
          initialInsights={{
            summary: insightsSummary,
            taskTypes,
            leaderboard,
            outcomes,
            capabilities,
            localFitCalibration,
          }}
          initialBenchmarks={{
            summary: benchmarkSummary,
            aliases: benchmarkAliases,
            unmatched: benchmarkUnmatchedWithSuggestions,
            refreshRuns,
          }}
          initialMaintenance={{
            cronConfigured: Boolean(process.env.CRON_SECRET),
            routability,
          }}
          activeSlugs={models.filter(m => m.active).map(m => m.slug).sort()}
        />
      </div>
    </div>
  )
}
