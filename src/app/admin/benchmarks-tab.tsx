'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  fetchBenchmarksData,
  addBenchmarkAlias,
  removeBenchmarkAlias,
  reingestSource,
  type BenchmarksData,
  type ReingestSource,
  type UnmatchedSourceModel,
  type SlugSuggestion,
} from './actions'
import type { MatchConfidence } from '@/lib/alias-matching'

interface BenchmarksTabProps {
  initialData: BenchmarksData
  activeSlugs: string[]
}

// Every benchmark source we know about, in display order. Live sources expose a
// "Re-fetch" button; mteb/livebench are shown disabled with an explanation so
// the table documents the full source set rather than only ingested ones.
const SOURCES: Array<{
  source: string
  refetch: ReingestSource | null
  disabledReason?: string
}> = [
  { source: 'lmarena', refetch: 'lmarena' },
  { source: 'artificialanalysis', refetch: 'artificialanalysis' },
  { source: 'ecologits', refetch: 'ecologits' },
  { source: 'mteb', refetch: null, disabledReason: 'Seed data — re-curate via script' },
  { source: 'livebench', refetch: null, disabledReason: 'Licence pending' },
]

export default function BenchmarksTab({ initialData, activeSlugs }: BenchmarksTabProps) {
  const [data, setData] = useState<BenchmarksData>(initialData)
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  // Which source is mid re-fetch, so only that row's button shows a spinner.
  const [reingesting, setReingesting] = useState<string | null>(null)

  const filteredUnmatched = useMemo(() => {
    if (!search.trim()) return data.unmatched
    const q = search.toLowerCase()
    return data.unmatched.filter(u => u.sourceModelName.toLowerCase().includes(q))
  }, [data.unmatched, search])

  function refresh() {
    setFeedback(null)
    startTransition(async () => {
      try {
        const next = await fetchBenchmarksData()
        setData(next)
      } catch (err) {
        // Without this, a failed refresh (e.g. an expired admin session or a
        // DB hiccup) dies as a silent unhandled rejection — the button just
        // stops spinning with no explanation. Surface it like the other handlers.
        setFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Refresh failed',
        })
      }
    })
  }

  function handleReingest(source: ReingestSource) {
    // Live re-fetch writes to the shared production DB — confirm first.
    if (!window.confirm(
      `Re-fetch "${source}" from its live source now?\n\nThis fetches fresh data and upserts snapshots into the production database.`
    )) return
    setFeedback(null)
    setReingesting(source)
    startTransition(async () => {
      try {
        const res = await reingestSource(source)
        if (res.success && res.result) {
          const r = res.result
          setFeedback({
            type: 'success',
            message: `${source}: upserted ${r.inserted} of ${r.fetched} rows`
              + (r.autoMatched.length > 0 ? `, auto-matched ${r.autoMatched.length}` : '')
              + (r.unmatched.length > 0 ? `, ${r.unmatched.length} need review` : '')
              + ` (snapshot ${r.snapshotDate})`,
          })
          const next = await fetchBenchmarksData()
          setData(next)
        } else {
          setFeedback({ type: 'error', message: res.error ?? `Re-fetch ${source} failed` })
        }
      } finally {
        setReingesting(null)
      }
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
          {/* Re-reads the DB only — it does NOT fetch from sources (that's the
              per-row "Re-fetch"). Labelled "Reload view" to avoid the old
              "Refresh" confusion. */}
          <button onClick={refresh} disabled={isPending} className="btn-secondary text-xs disabled:opacity-50">
            {isPending && !reingesting ? 'Reloading...' : 'Reload view'}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-navy/70">
              <th className="py-2 font-medium">Source</th>
              <th className="py-2 font-medium">Total rows</th>
              <th className="py-2 font-medium">Matched</th>
              <th className="py-2 font-medium">Coverage</th>
              <th className="py-2 font-medium">Latest snapshot</th>
              <th className="py-2 font-medium text-right">Live re-fetch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {SOURCES.map(({ source, refetch, disabledReason }) => {
              const s = data.summary.find(row => row.source === source)
              const coverage = s && s.totalRows > 0 ? (s.matchedRows / s.totalRows) * 100 : 0
              const busy = reingesting === source
              return (
                <tr key={source}>
                  <td className="py-2 font-medium text-navy">{source}</td>
                  <td className="py-2 text-navy/70">{s ? s.totalRows.toLocaleString() : '—'}</td>
                  <td className="py-2 text-navy/70">{s ? s.matchedRows.toLocaleString() : '—'}</td>
                  <td className="py-2 text-navy/70">{s ? `${coverage.toFixed(1)}%` : '—'}</td>
                  <td className="py-2 text-navy/70">{s?.latestSnapshot ?? '—'}</td>
                  <td className="py-2 text-right">
                    {refetch ? (
                      <button
                        onClick={() => handleReingest(refetch)}
                        disabled={isPending}
                        className="text-teal hover:text-teal-light text-xs disabled:opacity-40"
                      >
                        {busy ? 'Re-fetching…' : 'Re-fetch'}
                      </button>
                    ) : (
                      <span className="text-navy/40 text-xs" title={disabledReason}>
                        {disabledReason}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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

const CONFIDENCE_BADGE: Record<MatchConfidence, { label: string; className: string }> = {
  exact: { label: 'exact', className: 'bg-teal/10 text-teal border-teal/30' },
  strong: { label: 'likely', className: 'bg-navy/5 text-navy/70 border-navy/20' },
  weak: { label: 'maybe', className: 'bg-coral/5 text-coral/80 border-coral/25' },
}

function ConfidenceBadge({ suggestion }: { suggestion: SlugSuggestion }) {
  const badge = CONFIDENCE_BADGE[suggestion.confidence]
  const title = suggestion.flags.length > 0 ? `differs by: ${suggestion.flags.join(', ')}` : undefined
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${badge.className}`} title={title}>
      {badge.label}{suggestion.flags.length > 0 ? ' ⚠' : ''}
    </span>
  )
}

function UnmatchedRow({
  row, activeSlugs, disabled, onMap,
}: {
  row: UnmatchedSourceModel
  activeSlugs: string[]
  disabled: boolean
  onMap: (slug: string) => void
}) {
  // Pre-select the top suggestion so the common case is a single click.
  const [slug, setSlug] = useState(row.suggestions[0]?.slug ?? '')
  const top = row.suggestions[0]
  const selectedSuggestion = row.suggestions.find(s => s.slug === slug)

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
          {selectedSuggestion && <ConfidenceBadge suggestion={selectedSuggestion} />}
          <button
            onClick={() => onMap(slug)}
            disabled={disabled || !slug}
            className="text-teal hover:text-teal-light text-xs disabled:opacity-30"
          >
            Map
          </button>
        </div>
        {row.suggestions.length === 0 ? (
          <p className="mt-1 text-[10px] text-navy/40">No suggestion — pick manually.</p>
        ) : (
          // Quick-pick chips for the ranked alternatives.
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {row.suggestions.map(s => (
              <button
                key={s.slug}
                onClick={() => setSlug(s.slug)}
                disabled={disabled}
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono disabled:opacity-40 ${
                  s.slug === slug ? 'bg-teal/15 text-teal' : 'bg-cream text-navy/60 hover:text-navy'
                }`}
                title={s.flags.length > 0 ? `differs by: ${s.flags.join(', ')}` : s.confidence}
              >
                {s.slug}{s.slug === top?.slug ? ' ★' : ''}
              </button>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}
