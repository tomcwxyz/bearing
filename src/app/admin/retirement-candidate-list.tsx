'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { RetirementCandidate } from '@/db/model-retirement'
import LifecycleBatchDialog from './lifecycle-batch-dialog'

export default function RetirementCandidateList({ candidates }: { candidates: RetirementCandidate[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [review, setReview] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const unique = new Map<string, RetirementCandidate>()
  for (const item of candidates) if (item.active && !unique.has(item.slug)) unique.set(item.slug, item)
  const list = [...unique.values()]

  function toggle(slug: string) {
    setSelected(current => current.includes(slug)
      ? current.filter(value => value !== slug)
      : current.length < 100 ? [...current, slug] : current)
    setReview(false)
  }

  return <section className="mt-5 space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-auto text-sm text-navy/60">{list.length} live candidate{list.length === 1 ? '' : 's'} to review</p>
      <button type="button" className="btn-secondary text-xs"
        onClick={() => { setSelected(list.slice(0, 100).map(item => item.slug)); setReview(false) }}>
        Select all{list.length > 100 ? ' (first 100)' : ''}
      </button>
      <button type="button" className="btn-secondary text-xs"
        onClick={() => { setSelected([]); setReview(false) }}>Clear</button>
      <button type="button" className="btn-primary text-xs disabled:opacity-40"
        disabled={selected.length === 0} onClick={() => setReview(true)}>
        Review retirement ({selected.length})
      </button>
    </div>
    {feedback && <p role="status" className="rounded-md border border-cream-dark p-3 text-sm">{feedback}</p>}
    {review && <LifecycleBatchDialog operation="retire" selected={selected}
      onCancel={() => setReview(false)}
      onComplete={result => {
        setFeedback(`Retired ${result.changed.length} model(s).` +
          (result.skipped.length ? ` ${result.skipped.length} had already changed state.` : ''))
        setReview(false)
        setSelected([])
        router.refresh()
      }} />}
    {list.length === 0
      ? <div className="rounded-lg border border-cream-dark bg-white p-6 text-navy/65">
          No sustained unavailability detected yet. Evidence accumulates during weekly catalogue checks.
        </div>
      : <div className="space-y-3">
          {list.map(model => <article key={model.slug} className="rounded-lg border border-cream-dark bg-white p-5">
            <div className="flex flex-wrap items-start gap-3">
              <input type="checkbox" className="mt-1 accent-teal"
                aria-label={`Select ${model.name}`} checked={selected.includes(model.slug)}
                disabled={!selected.includes(model.slug) && selected.length >= 100}
                onChange={() => toggle(model.slug)} />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl text-navy">{model.name}</h2>
                <p className="mt-1 text-xs text-navy/60">{model.provider} · {model.slug}</p>
                <p className="mt-3 text-sm text-navy/70">
                  {model.missingChecks} consecutive missing checks · {model.source}
                </p>
                <p className="mt-1 text-xs text-navy/55">
                  First: {new Date(model.firstMissingAt).toLocaleDateString('en-GB')}
                  {' · '}Latest: {new Date(model.lastMissingAt).toLocaleDateString('en-GB')}
                </p>
                {model.note && <p className="mt-2 text-xs text-navy/60">{model.note}</p>}
                <Link className="mt-3 inline-block text-sm text-teal underline"
                  href={`/admin/models/${encodeURIComponent(model.slug)}`}>Review and edit model</Link>
              </div>
              <span className="text-xs font-medium text-coral">Live · retirement suggested</span>
            </div>
          </article>)}
        </div>}
  </section>
}
