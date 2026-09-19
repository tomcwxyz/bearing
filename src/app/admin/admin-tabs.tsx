'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import ModelsTable from './models-table'
import UsageTab from './usage-tab'
import InsightsTab from './insights-tab'
import DiscoverTab from './discover-tab'
import BenchmarksTab from './benchmarks-tab'
import MaintenanceTab from './maintenance-tab'
import type { AdminModel } from '@/db/models'
import type { ModelVerificationSummary } from '@/db/model-verification'
import type { UsageSummary, ActivityPoint, ModeCount, SignupPoint } from './types'
import type { InsightsSummary, TaskTypeCount, LeaderboardEntry, OutcomeBreakdown, CapabilityDemand, LocalFitCalibration } from './types'
import type { DiscoverModel } from './types'
import type { BenchmarksData } from './actions'
import type { MaintenanceState } from './maintenance-actions'

const TABS = [
  { key: 'models', label: 'Models' },
  { key: 'usage', label: 'Usage' },
  { key: 'insights', label: 'Insights' },
  { key: 'discover', label: 'Discover' },
  { key: 'benchmarks', label: 'Benchmarks' },
  { key: 'maintenance', label: 'Maintenance' },
] as const

type TabKey = typeof TABS[number]['key']

interface AdminTabsProps {
  models: AdminModel[]
  verification: ModelVerificationSummary[]
  initialDiscover: {
    newModels: DiscoverModel[]
    matchedCount: number
  }
  initialUsage: {
    summary: UsageSummary
    activity: ActivityPoint[]
    modes: ModeCount[]
    signups: SignupPoint[]
  }
  initialInsights: {
    summary: InsightsSummary
    taskTypes: TaskTypeCount[]
    leaderboard: LeaderboardEntry[]
    outcomes: OutcomeBreakdown
    capabilities: CapabilityDemand
    localFitCalibration: LocalFitCalibration
  }
  initialBenchmarks: BenchmarksData
  initialMaintenance: MaintenanceState
  activeSlugs: string[]
}

function AdminTabsInner({ models, verification, initialDiscover, initialUsage, initialInsights, initialBenchmarks, initialMaintenance, activeSlugs }: AdminTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = (searchParams.get('tab') as TabKey) || 'models'

  function setTab(tab: TabKey) {
    router.replace(`/admin?tab=${tab}`, { scroll: false })
  }

  return (
    <>
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-cream-dark">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'border-b-2 border-teal text-navy'
                : 'text-navy/50 hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'models' && <ModelsTable models={models} verification={verification} />}
        {activeTab === 'usage' && <UsageTab initialData={initialUsage} />}
        {activeTab === 'insights' && <InsightsTab initialData={initialInsights} />}
        {activeTab === 'discover' && <DiscoverTab initialModels={initialDiscover.newModels} matchedCount={initialDiscover.matchedCount} />}
        {activeTab === 'benchmarks' && <BenchmarksTab initialData={initialBenchmarks} activeSlugs={activeSlugs} />}
        {activeTab === 'maintenance' && <MaintenanceTab initialData={initialMaintenance} />}
      </div>
    </>
  )
}

// Wrap in Suspense because useSearchParams needs it
export default function AdminTabs(props: AdminTabsProps) {
  return (
    <Suspense fallback={<div className="mt-6 text-navy/40">Loading...</div>}>
      <AdminTabsInner {...props} />
    </Suspense>
  )
}
