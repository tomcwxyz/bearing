import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin, getAllModelsFromDb } from '@/lib/db'
import {
  getUsageSummary, getActivityOverTime, getModeBreakdown, getSignupsOverTime,
  getInsightsSummary, getTaskTypeDistribution, getModelLeaderboard,
  getOutcomeBreakdown, getCapabilityDemand,
} from '@/lib/dashboard'
import AdminTabs from './admin-tabs'

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')

  const admin = await isUserAdmin(user.id)
  if (!admin) redirect('/')

  const [
    models,
    usageSummary, activity, modes, signups,
    insightsSummary, taskTypes, leaderboard, outcomes, capabilities,
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
  ])

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <h1 className="font-display text-4xl text-navy">Admin</h1>

        <AdminTabs
          models={models}
          initialUsage={{ summary: usageSummary, activity, modes, signups }}
          initialInsights={{ summary: insightsSummary, taskTypes, leaderboard, outcomes, capabilities }}
        />
      </div>
    </div>
  )
}
