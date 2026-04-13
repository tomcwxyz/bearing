'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import type {
  InsightsSummary, TaskTypeCount, LeaderboardEntry,
  OutcomeBreakdown, CapabilityDemand,
} from './actions'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InsightsTabProps {
  initialData: {
    summary: InsightsSummary
    taskTypes: TaskTypeCount[]
    leaderboard: LeaderboardEntry[]
    outcomes: OutcomeBreakdown
    capabilities: CapabilityDemand
  }
}

// ---------------------------------------------------------------------------
// Summary card (nullable values — show "—" when missing)
// ---------------------------------------------------------------------------

function SummaryCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-cream-dark bg-white p-4 text-center">
      <p className="font-display text-3xl text-navy">{value}</p>
      <p className="mt-1 text-sm text-navy/60">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const TEAL = '#2D8B7A'
const CORAL = '#C75B3A'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InsightsTab({ initialData }: InsightsTabProps) {
  const { summary, taskTypes, leaderboard, outcomes, capabilities } = initialData

  // --- Derived display values for summary cards ---
  const successRateDisplay = summary.successRate != null
    ? `${(summary.successRate * 100).toFixed(1)}%`
    : '—'

  const avgRankDisplay = summary.avgSelectedRank != null
    ? summary.avgSelectedRank.toFixed(1)
    : '—'

  const topTaskTypeDisplay = summary.topTaskType ?? '—'

  const topModelDisplay = summary.topModel?.name ?? '—'

  // --- Outcome chart data ---
  const outcomeData = [
    { label: 'Success', count: outcomes.successes },
    ...outcomes.failureReasons.map((fr) => ({
      label: fr.reason,
      count: fr.count,
    })),
  ]

  // --- Capability chart data ---
  const capabilityData = [
    { capability: 'Vision', count: capabilities.vision },
    { capability: 'Tools', count: capabilities.tools },
    { capability: 'Code', count: capabilities.code },
  ]

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard value={successRateDisplay} label="Outcome success rate" />
        <SummaryCard value={avgRankDisplay} label="Avg selected rank" />
        <SummaryCard value={topTaskTypeDisplay} label="Most requested task type" />
        <SummaryCard value={topModelDisplay} label="Most selected model" />
      </div>

      {/* Task type distribution */}
      <div className="rounded-lg border border-cream-dark bg-white p-5">
        <h3 className="mb-4 font-display text-lg text-navy">Task type distribution</h3>
        {taskTypes.length === 0 ? (
          <p className="py-12 text-center text-sm text-navy/40">No task type data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={taskTypes} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis dataKey="taskType" type="category" tick={{ fontSize: 12 }} width={120} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #E8E0D0' }} />
              <Bar dataKey="count" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Model leaderboard */}
      <div className="rounded-lg border border-cream-dark bg-white p-5">
        <h3 className="mb-4 font-display text-lg text-navy">Model leaderboard</h3>
        {leaderboard.length === 0 ? (
          <p className="py-12 text-center text-sm text-navy/40">No model data yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-cream-dark">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream-dark/60">
                <tr>
                  <th className="px-3 py-2 font-medium text-navy">Model</th>
                  <th className="px-3 py-2 font-medium text-navy text-right">Recommended</th>
                  <th className="px-3 py-2 font-medium text-navy text-right">Selected</th>
                  <th className="px-3 py-2 font-medium text-navy text-right">Selection Rate</th>
                  <th className="px-3 py-2 font-medium text-navy text-right">Avg Rank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-dark">
                {leaderboard.map((entry) => (
                  <tr key={entry.slug} className="hover:bg-cream-dark/20">
                    <td className="px-3 py-2 font-medium text-navy">{entry.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-navy/70">
                      {entry.timesRecommended}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-navy/70">
                      {entry.timesSelected}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-navy/70">
                      {(entry.selectionRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-navy/70">
                      {entry.avgRank != null ? entry.avgRank.toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Outcome breakdown */}
      <div className="rounded-lg border border-cream-dark bg-white p-5">
        <h3 className="mb-4 font-display text-lg text-navy">Outcome breakdown</h3>
        {outcomes.successes === 0 && outcomes.failures === 0 ? (
          <p className="py-12 text-center text-sm text-navy/40">No outcome data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={outcomeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #E8E0D0' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {outcomeData.map((entry, index) => (
                  <Cell
                    key={entry.label}
                    fill={index === 0 ? TEAL : CORAL}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Capability demand */}
      <div className="rounded-lg border border-cream-dark bg-white p-5">
        <h3 className="mb-4 font-display text-lg text-navy">Capability demand</h3>
        {capabilities.vision === 0 && capabilities.tools === 0 && capabilities.code === 0 ? (
          <p className="py-12 text-center text-sm text-navy/40">No capability data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={capabilityData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis dataKey="capability" type="category" tick={{ fontSize: 12 }} width={80} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #E8E0D0' }} />
              <Bar dataKey="count" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
