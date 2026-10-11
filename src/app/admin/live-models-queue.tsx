'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AdminModel } from '@/db/models'
import type { ModelVerificationSummary, VerificationObservation } from '@/db/model-verification'
import { assessModelFreshness, freshnessLabel } from '@/lib/model-freshness'
import { verifyLiveModelsAdmin } from './freshness-actions'

type BatchResult = Awaited<ReturnType<typeof verifyLiveModelsAdmin>>
type View = 'all' | 'needs-check' | 'unverified' | 'attention'

function statusOf(summary?: ModelVerificationSummary, observed?: VerificationObservation) {
  if (!summary) return { label: 'Not verified', bad: true, note: 'No verification data loaded' }
  if (!summary.openrouterId && !summary.providerModelId) {
    return { label: 'No catalogue ID', bad: true, note: 'Add a provider-native or OpenRouter identifier' }
  }
  const assessed = assessModelFreshness(observed
    ? { last_verified_at: observed.verifiedAt, verification_status: observed.status }
    : summary)
  return {
    label: freshnessLabel(assessed),
    bad: assessed.needsAttention,
    note: observed?.note ?? summary.verification_note ?? summary.verification_source ?? '',
  }
}

export default function LiveModelsQueue({
  models,
  verification,
}: {
  models: AdminModel[]
  verification: ModelVerificationSummary[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [view, setView] = useState<View>('all')
  const [isVerifying, startVerifying] = useTransition()
  const [result, setResult] = useState<BatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bySlug = useMemo(
    () => new Map(verification.map(item => [item.slug, item])),
    [verification],
  )
  const latest = useMemo(
    () => new Map(result?.observations.map(item => [item.slug, item]) ?? []),
    [result],
  )
  const displayed = models.filter(model => {
    const status = statusOf(bySlug.get(model.slug), latest.get(model.slug))
    if (view === 'needs-check') return status.bad
    if (view === 'unverified') return status.label === 'No catalogue ID' || status.label === 'Not verified' || status.label === 'Verification stale'
    if (view === 'attention') return status.label === 'Needs attention' || status.label === 'Unavailable'
    return true
  })
  const needsCheck = models.filter(model => statusOf(bySlug.get(model.slug), latest.get(model.slug)).bad)
  const allVisibleSelected = displayed.length > 0 && displayed.every(model => selected.includes(model.slug))

  function toggle(slug: string) {
    setSelected(current => current.includes(slug)
      ? current.filter(value => value !== slug)
      : current.length < 100 ? [...current, slug] : current)
  }

  function verify(requested?: string[]) {
    setError(null)
    setResult(null)
    startVerifying(async () => {
      try {
        const report = await verifyLiveModelsAdmin(requested)
        setResult(report)
        router.refresh()
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Unable to verify live models')
      }
    })
  }

  return (
    <section className="mt-5 space-y-4">
      <div className="rounded-lg border border-cream-dark bg-white/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl text-navy">Live model verification</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-navy/65">
              Select individual models, review models needing checks, or verify all live models.
              The scheduled catalogue check runs every Monday at 04:00 UTC.
              Verification records evidence; it never removes models or changes scores.
            </p>
            <p className="mt-2 text-xs text-navy/55">
              {models.length} live models · {needsCheck.length} needing a check or review
            </p>
          </div>
          <button
            type="button"
            className="btn-primary text-sm disabled:opacity-40"
            disabled={isVerifying || models.length === 0}
            onClick={() => verify()}
          >
            {isVerifying ? 'Verifying…' : `Verify all live (${models.length})`}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-xs" disabled={isVerifying}
            onClick={() => setSelected(displayed.slice(0, 100).map(model => model.slug))}>
            Select visible{displayed.length > 100 ? ' (first 100)' : ''}
          </button>
          <button type="button" className="btn-secondary text-xs" disabled={isVerifying}
            onClick={() => { setView('needs-check'); setSelected(needsCheck.slice(0, 100).map(model => model.slug)) }}>
            Select needing review{needsCheck.length > 100 ? ' (first 100)' : ''}
          </button>
          <button type="button" className="btn-secondary text-xs" disabled={isVerifying}
            onClick={() => setSelected([])}>Clear selection</button>
          <button type="button" className="btn-secondary text-xs disabled:opacity-40"
            disabled={isVerifying || selected.length === 0}
            onClick={() => verify(selected)}>
            {isVerifying ? 'Verifying…' : `Verify selected (${selected.length})`}
          </button>
        </div>
        {models.length > 100 && <p className="mt-2 text-xs text-navy/50">
          Selected batches are limited to 100 models. Use Verify all live for the full catalogue.
        </p>}
      </div>

      {error && <p role="alert" className="rounded-md border border-coral/30 p-3 text-sm text-coral">{error}</p>}
      {result && (
        <div role="status" className="rounded-lg border border-cream-dark bg-white p-4 text-sm text-navy">
          <h3 className="font-medium">Verification finished · {result.targeted} targeted</h3>
          <p className="mt-1 text-navy/70">
            {result.checked} checked · {result.current} current · {result.attention} need review ·
            {' '}{result.unavailable} unavailable · {result.unverifiedModels.length} not checked
          </p>
          {result.sourceIssues.length > 0 && <p className="mt-2 text-coral">
            {result.sourceIssues.length} source issue(s). Results are partial; unchecked models retain their previous status.
          </p>}
          {result.unverifiedModels.length > 0 && <details className="mt-2">
            <summary className="cursor-pointer text-teal">Why were {result.unverifiedModels.length} not checked?</summary>
            <ul className="mt-2 space-y-1 text-xs text-navy/70">
              {result.unverifiedModels.map(item => (
                <li key={item.slug}>
                  <Link className="underline" href={`/admin/models/${encodeURIComponent(item.slug)}/identifiers`}>{item.slug}</Link>
                  {' — '}{item.reason === 'no_catalogue_id' ? 'No catalogue identifier' : 'Mapped source was not checked'}
                </li>
              ))}
            </ul>
          </details>}
          {result.sourceIssues.length > 0 && <details className="mt-2">
            <summary className="cursor-pointer text-teal">Source failures</summary>
            <ul className="mt-2 space-y-1 text-xs text-navy/70">
              {result.sourceIssues.map((issue, index) => <li key={index}>{issue}</li>)}
            </ul>
          </details>}
          {(result.attention + result.unavailable) > 0 && <details className="mt-2">
            <summary className="cursor-pointer text-teal">Models needing attention</summary>
            <ul className="mt-2 space-y-1 text-xs text-navy/70">
              {result.observations.filter(o => o.status !== 'current').map(item => (
                <li key={item.slug}>
                  <Link className="underline" href={`/admin/models/${encodeURIComponent(item.slug)}`}>{item.slug}</Link>
                  {' · '}{item.status}{item.note ? ` — ${item.note}` : ''}
                </li>
              ))}
            </ul>
          </details>}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter live models">
          {([
            ['all', 'All'],
            ['needs-check', 'Needs check'],
            ['unverified', 'Unverified or stale'],
            ['attention', 'Attention / unavailable'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={view === value}
              className={`rounded-md border px-3 py-1.5 text-xs ${view === value ? 'border-teal text-teal' : 'border-navy/15 text-navy/65'}`}
              onClick={() => setView(value)}>{label}</button>
          ))}
        </div>
        <p className="text-xs text-navy/55">{displayed.length} shown · {selected.length} selected</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-cream-dark">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-dark/60">
            <tr>
              <th className="px-3 py-3 font-medium text-navy">
                <input type="checkbox" aria-label="Select all visible models (up to 100)"
                  checked={allVisibleSelected} disabled={isVerifying || displayed.length === 0}
                  onChange={event => setSelected(event.target.checked ? displayed.slice(0, 100).map(model => model.slug) : [])}
                  className="accent-teal" />
              </th>
              <th className="px-3 py-3 font-medium text-navy">Live model</th>
              <th className="px-3 py-3 font-medium text-navy">Verification</th>
              <th className="px-3 py-3 font-medium text-navy">Pricing (in/out)</th>
              <th className="px-3 py-3 font-medium text-navy">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {displayed.map(model => {
              const summary = bySlug.get(model.slug)
              const observed = latest.get(model.slug)
              const status = statusOf(summary, observed)
              return (
                <tr key={model.slug} className="bg-white/55 hover:bg-cream-dark/20">
                  <td className="px-3 py-3">
                    <input type="checkbox" aria-label={`Select ${model.name}`}
                      checked={selected.includes(model.slug)} disabled={isVerifying || (!selected.includes(model.slug) && selected.length >= 100)}
                      onChange={() => toggle(model.slug)} className="accent-teal" />
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-navy">{model.name}</p>
                    <p className="text-xs text-navy/55">{model.provider} · {model.slug}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span title={status.note} className={`rounded-full border px-2 py-0.5 text-xs ${status.bad ? 'border-coral/30 text-coral' : 'border-teal/30 text-teal'}`}>
                      {status.label}
                    </span>
                    <p className="mt-1 text-xs text-navy/50">
                      {observed?.source ?? summary?.verification_source ?? 'Not checked'}
                      {' · '}{observed?.verifiedAt || summary?.last_verified_at
                        ? new Date(observed?.verifiedAt ?? summary?.last_verified_at ?? '').toLocaleDateString('en-GB')
                        : 'never'}
                    </p>
                    {status.bad && status.note && <p className="mt-1 max-w-xs text-xs text-navy/60">{status.note}</p>}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-navy/65">
                    ${model.pricing.input_per_1m} / ${model.pricing.output_per_1m}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-3 text-xs">
                      <Link href={`/admin/models/${encodeURIComponent(model.slug)}/identifiers`} className="text-navy/70 underline">IDs</Link>
                      <Link href={`/admin/models/${encodeURIComponent(model.slug)}`} className="text-teal underline">Edit</Link>
                    </div>
                  </td>
                </tr>
              )
            })}
            {displayed.length === 0 && <tr><td className="p-5 text-sm text-navy/60" colSpan={5}>
              No live models match this filter.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
