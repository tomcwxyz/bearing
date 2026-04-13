'use client'

import { useState, useTransition } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import GranularityToggle from './granularity-toggle'
import { fetchUsageData } from './actions'
import type {
  UsageSummary, ActivityPoint, ModeCount, SignupPoint,
} from './actions'
import type { Granularity } from '@/lib/dashboard'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface UsageTabProps {
  initialData: {
    summary: UsageSummary
    activity: ActivityPoint[]
    modes: ModeCount[]
    signups: SignupPoint[]
  }
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-cream-dark bg-white p-4 text-center">
      <p className="font-display text-3xl text-navy">{value.toLocaleString()}</p>
      <p className="mt-1 text-sm text-navy/60">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Format period strings for chart axes
// ---------------------------------------------------------------------------

function shortDate(value: string | number): string {
  const date = new Date(value)
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UsageTab({ initialData }: UsageTabProps) {
  const [data, setData] = useState(initialData)
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [isPending, startTransition] = useTransition()

  function handleGranularityChange(next: Granularity) {
    setGranularity(next)
    startTransition(async () => {
      const fresh = await fetchUsageData(next)
      setData(fresh)
    })
  }

  const { summary, activity, modes, signups } = data

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard value={summary.totalTasks} label="Total tasks" />
        <SummaryCard value={summary.totalUsers} label="Total users" />
        <SummaryCard value={summary.totalSelections} label="Total selections" />
        <SummaryCard value={summary.totalComparisons} label="Total comparisons" />
      </div>

      {/* Granularity toggle */}
      <div className="flex justify-end">
        <GranularityToggle value={granularity} onChange={handleGranularityChange} />
      </div>

      {/* Activity over time */}
      <div className="rounded-lg border border-cream-dark bg-white p-5">
        <h3 className="mb-4 font-display text-lg text-navy">Activity over time</h3>
        {activity.length === 0 ? (
          <p className="py-12 text-center text-sm text-navy/40">No activity data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={activity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" />
              <XAxis dataKey="period" tickFormatter={shortDate} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #E8E0D0' }}
                labelFormatter={shortDate}
              />
              <Legend />
              <Line type="monotone" dataKey="tasks" stroke="#2D8B7A" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="selections" stroke="#C75B3A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Mode breakdown */}
      <div className="rounded-lg border border-cream-dark bg-white p-5">
        <h3 className="mb-4 font-display text-lg text-navy">Mode breakdown</h3>
        {modes.length === 0 ? (
          <p className="py-12 text-center text-sm text-navy/40">No mode data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={modes} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis dataKey="mode" type="category" tick={{ fontSize: 12 }} width={100} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #E8E0D0' }} />
              <Bar dataKey="count" fill="#2D8B7A" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* User signups over time */}
      <div className="rounded-lg border border-cream-dark bg-white p-5">
        <h3 className="mb-4 font-display text-lg text-navy">User signups over time</h3>
        {signups.length === 0 ? (
          <p className="py-12 text-center text-sm text-navy/40">No signup data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={signups}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" />
              <XAxis dataKey="period" tickFormatter={shortDate} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #E8E0D0' }}
                labelFormatter={shortDate}
              />
              <Line type="monotone" dataKey="signups" stroke="#2D8B7A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Loading overlay */}
      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50">
          <p className="text-sm text-navy/60">Updating...</p>
        </div>
      )}
    </div>
  )
}
