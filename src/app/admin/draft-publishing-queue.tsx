'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { AdminModel } from '@/db/models'
import { assessDraftReadiness, type DraftPublishMeta } from '@/lib/draft-publish'
import { publishDraftBatch } from './draft-publish-actions'

export default function DraftPublishingQueue({
  drafts, metadata,
}: {
  drafts: AdminModel[]
  metadata: DraftPublishMeta[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [review, setReview] = useState(false)
  const [acknowledge, setAcknowledge] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isPublishing, startPublishing] = useTransition()

  const metaMap = useMemo(() => new Map(metadata.map(m => [m.slug, m])), [metadata])
  const assessments = useMemo(() => drafts.map(model => {
    const meta = metaMap.get(model.slug) ?? {
      slug: model.slug, openrouterId: null, providerModelId: null,
      verificationStatus: null, benchmarkSources: [],
    }
    return { model, meta, ...assessDraftReadiness(model, meta) }
  }), [drafts, metaMap])
  const readySlugs = assessments.filter(a => a.ready).map(a => a.model.slug)
  const selection = assessments.filter(a => selected.includes(a.model.slug))
  const hasWarnings = selection.some(a => a.warnings.length > 0)
  const canPublish = selection.length > 0 && selection.every(a => a.ready) &&
    (!hasWarnings || acknowledge)

  function toggle(slug: string) {
    setSelected(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])
    setReview(false)
    setAcknowledge(false)
  }

  function publish() {
    if (!canPublish) return
    startPublishing(async () => {
      try {
        const result = await publishDraftBatch(selected, acknowledge)
        setFeedback(
          `Published ${result.published.length} model(s).` +
          (result.skipped.length ? ` ${result.skipped.length} not published: ${result.skipped.map(s => `${s.slug} (${s.reason})`).join('; ')}` : ''),
        )
        setSelected([])
        setReview(false)
        setAcknowledge(false)
        router.refresh()
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Unable to publish drafts')
      }
    })
  }

  if (drafts.length === 0) {
    return <div className="rounded-lg border border-cream-dark bg-white p-5 text-sm text-navy/60">
      No drafts waiting. <Link className="text-teal underline" href="/admin?tab=discover">Discover models</Link> to add more.
    </div>
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-navy">Drafts to review</h2>
          <p className="mt-1 text-sm text-navy/60">
            {drafts.length} drafts · {readySlugs.length} with valid configuration.
            Benchmark and catalogue warnings can be acknowledged before publishing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary text-xs"
            onClick={() => { setSelected(readySlugs); setReview(false); setAcknowledge(false) }}>
            Select all eligible
          </button>
          <button className="btn-secondary text-xs"
            onClick={() => { setSelected([]); setReview(false); setAcknowledge(false) }}>
            Clear
          </button>
          <button disabled={selected.length === 0 || isPublishing}
            className="btn-primary text-xs disabled:opacity-40"
            onClick={() => setReview(true)}>
            Review {selected.length} to publish
          </button>
        </div>
      </header>

      {feedback && <p role="status" className="rounded-md border border-cream-dark bg-cream p-3 text-sm text-navy">{feedback}</p>}
      <div className="overflow-x-auto rounded-lg border border-cream-dark">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-dark/60">
            <tr>
              <th className="px-3 py-3 font-medium text-navy">Select</th>
              <th className="px-3 py-3 font-medium text-navy">Draft model</th>
              <th className="px-3 py-3 font-medium text-navy">Benchmark evidence</th>
              <th className="px-3 py-3 font-medium text-navy">Publication readiness</th>
              <th className="px-3 py-3 font-medium text-navy">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {assessments.map(({ model, meta, ready, blockers, warnings }) => (
              <tr key={model.slug} className="bg-white">
                <td className="px-3 py-3">
                  <input type="checkbox" aria-label={`Select ${model.name}`}
                    checked={selected.includes(model.slug)}
                    disabled={!ready || isPublishing}
                    onChange={() => toggle(model.slug)}
                    className="accent-teal" />
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium text-navy">{model.name}</p>
                  <p className="text-xs text-navy/50">{model.provider} · {model.slug}</p>
                </td>
                <td className="px-3 py-3 text-xs text-navy/65">
                  {meta.benchmarkSources.length ? meta.benchmarkSources.join(', ') : 'No approved source'}
                </td>
                <td className="px-3 py-3">
                  <p className={ready ? 'text-teal text-xs font-medium' : 'text-coral text-xs font-medium'}>
                    {ready ? warnings.length ? 'Review warnings' : 'Ready' : 'Needs editing'}
                  </p>
                  {blockers.concat(warnings).map(message =>
                    <p key={message} className="mt-1 text-xs text-navy/55">{message}</p>)}
                </td>
                <td className="px-3 py-3">
                  <Link href={`/admin/models/${encodeURIComponent(model.slug)}`}
                    className="text-sm text-teal underline underline-offset-2">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {review && (
        <div className="rounded-lg border border-teal/30 bg-white p-5">
          <h3 className="font-display text-lg text-navy">Confirm publication</h3>
          <p className="mt-1 text-sm text-navy/65">
            These {selection.length} draft models will become visible in public recommendations.
            You can deactivate them later.
          </p>
          <ul className="mt-3 space-y-2">
            {selection.map(a => (
              <li key={a.model.slug} className="text-sm text-navy">
                <strong>{a.model.name}</strong>
                {a.warnings.length > 0 && <p className="text-xs text-navy/60">
                  {a.warnings.join(' · ')}
                </p>}
              </li>
            ))}
          </ul>
          {hasWarnings && (
            <label className="mt-4 flex items-start gap-2 text-sm text-navy">
              <input type="checkbox" checked={acknowledge} onChange={e => setAcknowledge(e.target.checked)}
                className="mt-1 accent-teal"/>
              <span>I have reviewed these warnings and want to publish the selected models.</span>
            </label>
          )}
          <div className="mt-4 flex gap-3">
            <button disabled={!canPublish || isPublishing} onClick={publish}
              className="btn-primary text-sm disabled:opacity-40">
              {isPublishing ? 'Publishing…' : `Publish ${selection.length} models`}
            </button>
            <button className="btn-secondary text-sm" disabled={isPublishing} onClick={() => setReview(false)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}
