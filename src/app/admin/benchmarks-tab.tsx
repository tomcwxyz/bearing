'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  fetchBenchmarksData,
  addBenchmarkAlias,
  removeBenchmarkAlias,
  type BenchmarksData,
} from './actions'

interface BenchmarksTabProps {
  initialData: BenchmarksData
  activeSlugs: string[]
}

export default function BenchmarksTab({ initialData, activeSlugs }: BenchmarksTabProps) {
  const [data, setData] = useState<BenchmarksData>(initialData)
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const filteredUnmatched = useMemo(() => {
    if (!search.trim()) return data.unmatched
    const q = search.toLowerCase()
    return data.unmatched.filter(u => u.sourceModelName.toLowerCase().includes(q))
  }, [data.unmatched, search])

  function refresh() {
    startTransition(async () => {
      const next = await fetchBenchmarksData()
      setData(next)
    })
  }

  function handleAdd(source: string, sourceModelName: string, bearingSlug: string) {
    if (!bearingSlug) return
    setFeedback(null)
    startTransition(async () => {
      const result = await addBenchmarkAlias(source, sourceModelName, bearingSlug, null)
      if (result.success) {
        setFeedback({ type: 'success', message: `Mapped ${sourceModelName} → ${bearingSlug}` })
        const next = await fetchBenchmarksData()
        setData(next)
      } else {
        setFeedback({ type: 'error', message: result.error ?? 'Add failed' })
      }
    })
  }

  function handleRemove(source: string, sourceModelName: string) {
    setFeedback(null)
    startTransition(async () => {
      const result = await removeBenchmarkAlias(source, sourceModelName)
      if (result.success) {
        setFeedback({ type: 'success', message: `Removed alias for ${sourceModelName}` })
        const next = await fetchBenchmarksData()
        setData(next)
      } else {
        setFeedback({ type: 'error', message: result.error ?? 'Remove failed' })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <section className="rounded-lg border border-cream-dark bg-white p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-display text-lg text-navy">Benchmark Sources</h2>
            <p className="text-sm text-navy/60">
              External benchmark snapshots blended into the quality factor
            </p>
          </div>
          <button onClick={refresh} disabled={isPending} className="btn-secondary text-xs disabled:opacity-50">
            {isPending ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {data.summary.length === 0 ? (
          <p className="text-sm text-navy/50">No benchmark snapshots ingested yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-navy/70">
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 font-medium">Total rows</th>
                <th className="py-2 font-medium">Matched</th>
                <th className="py-2 font-medium">Coverage</th>
                <th className="py-2 font-medium">Latest snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-dark">
              {data.summary.map(s => {
                const coverage = s.totalRows > 0 ? (s.matchedRows / s.totalRows) * 100 : 0
                return (
                  <tr key={s.source}>
                    <td className="py-2 font-medium text-navy">{s.source}</td>
                    <td className="py-2 text-navy/70">{s.totalRows.toLocaleString()}</td>
                    <td className="py-2 text-navy/70">{s.matchedRows.toLocaleString()}</td>
                    <td className="py-2 text-navy/70">{coverage.toFixed(1)}%</td>
                    <td className="py-2 text-navy/70">{s.latestSnapshot ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {feedback && (
        <div className={`rounded-md border px-4 py-3 text-sm ${
          feedback.type === 'success'
            ? 'border-teal/30 bg-teal/5 text-teal'
            : 'border-coral/30 bg-coral/5 text-coral'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* Existing aliases */}
      <section className="rounded-lg border border-cream-dark bg-white p-5">
        <h2 className="font-display text-lg text-navy mb-4">
          Aliases <span className="text-sm font-normal text-navy/50">({data.aliases.length})</span>
        </h2>
        {data.aliases.length === 0 ? (
          <p className="text-sm text-navy/50">No aliases yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-navy/70">
                  <th className="py-2 font-medium">Source</th>
                  <th className="py-2 font-medium">Source name</th>
                  <th className="py-2 font-medium">Bearing slug</th>
                  <th className="py-2 font-medium">Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-dark">
                {data.aliases.map(a => (
                  <tr key={`${a.source}::${a.sourceModelName}`}>
                    <td className="py-2 text-navy/70">{a.source}</td>
                    <td className="py-2 font-mono text-xs text-navy/80">{a.sourceModelName}</td>
                    <td className="py-2 font-mono text-xs text-navy">{a.bearingSlug}</td>
                    <td className="py-2 text-navy/50 text-xs">{a.notes ?? ''}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleRemove(a.source, a.sourceModelName)}
                        disabled={isPending}
                        className="text-coral/70 hover:text-coral text-xs disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Unmatched */}
      <section className="rounded-lg border border-cream-dark bg-white p-5">
        <h2 className="font-display text-lg text-navy mb-2">
          Unmatched source models <span className="text-sm font-normal text-navy/50">({data.unmatched.length})</span>
        </h2>
        <p className="text-sm text-navy/60 mb-4">
          Sorted by max vote count — highest-signal models first. Map them to a bearing slug
          to back-fill all existing snapshots.
        </p>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search source name..."
          className="input-field w-full mb-4"
        />
        {filteredUnmatched.length === 0 ? (
          <p className="text-sm text-navy/50">
            {search.trim() ? 'No matches.' : 'All source models are mapped.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-navy/70">
                  <th className="py-2 font-medium">Source</th>
                  <th className="py-2 font-medium">Source name</th>
                  <th className="py-2 font-medium">Votes</th>
                  <th className="py-2 font-medium">Map to slug</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-dark">
                {filteredUnmatched.slice(0, 100).map(u => (
                  <UnmatchedRow
                    key={`${u.source}::${u.sourceModelName}`}
                    row={u}
                    activeSlugs={activeSlugs}
                    disabled={isPending}
                    onMap={slug => handleAdd(u.source, u.sourceModelName, slug)}
                  />
                ))}
              </tbody>
            </table>
            {filteredUnmatched.length > 100 && (
              <p className="mt-3 text-xs text-navy/50">
                Showing top 100 of {filteredUnmatched.length}. Refine search to see more.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function UnmatchedRow({
  row, activeSlugs, disabled, onMap,
}: {
  row: { source: string; sourceModelName: string; maxVoteCount: number | null }
  activeSlugs: string[]
  disabled: boolean
  onMap: (slug: string) => void
}) {
  const [slug, setSlug] = useState('')
  return (
    <tr>
      <td className="py-2 text-navy/70">{row.source}</td>
      <td className="py-2 font-mono text-xs text-navy/80">{row.sourceModelName}</td>
      <td className="py-2 text-navy/70">{row.maxVoteCount?.toLocaleString() ?? '—'}</td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          <select
            value={slug}
            onChange={e => setSlug(e.target.value)}
            disabled={disabled}
            className="input-field text-xs flex-1"
          >
            <option value="">Pick slug…</option>
            {activeSlugs.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={() => onMap(slug)}
            disabled={disabled || !slug}
            className="text-teal hover:text-teal-light text-xs disabled:opacity-30"
          >
            Map
          </button>
        </div>
      </td>
    </tr>
  )
}
