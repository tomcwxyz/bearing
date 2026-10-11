'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { AdminModel } from '@/db/models'
import type { ModelVerificationSummary } from '@/db/model-verification'
import { assessModelFreshness, freshnessLabel } from '@/lib/model-freshness'
import LifecycleBatchDialog from './lifecycle-batch-dialog'

export default function RetiredModelsQueue({
  models, verification,
}: {
  models: AdminModel[]
  verification: ModelVerificationSummary[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [restoring, setRestoring] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const summaryBySlug = new Map(verification.map(item => [item.slug, item]))

  function toggle(slug: string) {
    setSelected(previous => previous.includes(slug)
      ? previous.filter(item => item !== slug)
      : previous.length < 100 ? [...previous, slug] : previous)
    setRestoring(false)
  }

  return <section className="mt-5 space-y-4">
    <header className="rounded-lg border border-cream-dark bg-white/60 p-4">
      <h2 className="font-display text-xl text-navy">Retired models</h2>
      <p className="mt-1 max-w-2xl text-sm text-navy/65">
        These were previously live or explicitly archived by an administrator. They are not drafts
        and cannot appear in new recommendations. Historical evidence and identifiers are retained.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-xs"
          onClick={() => { setSelected(models.slice(0, 100).map(item => item.slug)); setRestoring(false) }}>
          Select all{models.length > 100 ? ' (first 100)' : ''}
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => { setSelected([]); setRestoring(false) }}>Clear</button>
        <button type="button" className="btn-primary text-xs disabled:opacity-40"
          disabled={selected.length === 0} onClick={() => setRestoring(true)}>
          Review restoration ({selected.length})
        </button>
      </div>
    </header>

    {feedback && <p role="status" className="rounded-lg border border-cream-dark p-3 text-sm text-navy">{feedback}</p>}
    {restoring && <LifecycleBatchDialog operation="restore" selected={selected}
      onCancel={() => setRestoring(false)}
      onComplete={result => {
        setFeedback(`Restored ${result.changed.length} models to live.` +
          (result.skipped.length ? ` ${result.skipped.length} not changed because their state was updated.` : ''))
        setRestoring(false)
        setSelected([])
        router.refresh()
      }} />}

    <div className="overflow-x-auto rounded-lg border border-cream-dark">
      <table className="w-full text-left text-sm">
        <thead className="bg-cream-dark/60">
          <tr>
            <th className="px-3 py-3 font-medium text-navy">Select</th>
            <th className="px-3 py-3 font-medium text-navy">Model</th>
            <th className="px-3 py-3 font-medium text-navy">Retirement</th>
            <th className="px-3 py-3 font-medium text-navy">Last verification</th>
            <th className="px-3 py-3 font-medium text-navy">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cream-dark">
          {models.map(model => {
            const summary = summaryBySlug.get(model.slug)
            const freshness = summary ? assessModelFreshness(summary) : null
            return <tr key={model.slug} className="bg-white/55">
              <td className="px-3 py-3">
                <input type="checkbox" className="accent-teal" aria-label={`Select ${model.name}`}
                  checked={selected.includes(model.slug)}
                  disabled={restoring || (!selected.includes(model.slug) && selected.length >= 100)}
                  onChange={() => toggle(model.slug)} />
              </td>
              <td className="px-3 py-3">
                <div className="font-medium text-navy">{model.name}</div>
                <div className="text-xs text-navy/55">{model.provider} · {model.slug}</div>
              </td>
              <td className="px-3 py-3 text-xs text-navy/70">
                <p>{model.retiredAt ? new Date(model.retiredAt).toLocaleDateString('en-GB') : 'Unknown'}</p>
                <p className="mt-1 max-w-sm">{model.retirementReason ?? 'Reason not recorded'}</p>
              </td>
              <td className="px-3 py-3 text-xs text-navy/65">
                {freshness ? freshnessLabel(freshness) : 'Not verified'}
                <p className="mt-1 text-navy/50">
                  {summary?.last_verified_at ? new Date(summary.last_verified_at).toLocaleDateString('en-GB') : 'Never'}
                </p>
              </td>
              <td className="px-3 py-3 text-xs">
                <div className="flex gap-3">
                  <Link className="text-teal underline" href={`/admin/models/${encodeURIComponent(model.slug)}`}>Edit</Link>
                  <Link className="text-navy/60 underline" href={`/admin/models/${encodeURIComponent(model.slug)}/identifiers`}>IDs</Link>
                </div>
              </td>
            </tr>
          })}
          {models.length === 0 && <tr><td colSpan={5} className="p-5 text-sm text-navy/60">No retired models.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>
}
