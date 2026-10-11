'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AdminModel } from '@/db/models'
import type { ModelVerificationSummary } from '@/db/model-verification'
import { assessModelFreshness } from '@/lib/model-freshness'
import type { DraftPublishMeta } from '@/lib/draft-publish'
import DraftPublishingQueue from './draft-publishing-queue'
import LiveModelsQueue from './live-models-queue'
import RetiredModelsQueue from './retired-models-queue'

type CatalogueTab = 'draft' | 'live' | 'retired'

export default function ModelsTable({
  models, verification, draftPublishMeta,
}: {
  models: AdminModel[]
  verification: ModelVerificationSummary[]
  draftPublishMeta: DraftPublishMeta[]
}) {
  const drafts = models.filter(model => model.lifecycleStatus === 'draft')
  const live = models.filter(model => model.lifecycleStatus === 'live')
  const retired = models.filter(model => model.lifecycleStatus === 'retired')
  const [tab, setTab] = useState<CatalogueTab>(drafts.length ? 'draft' : live.length ? 'live' : 'retired')
  const mappedCount = verification.filter(row => row.active && (row.providerModelId || row.openrouterId)).length
  const needsAttentionCount = live.filter(model => {
    const row = verification.find(item => item.slug === model.slug)
    return !row || (!row.providerModelId && !row.openrouterId) || assessModelFreshness(row).needsAttention
  }).length
  const buttons: Array<[CatalogueTab, string, number]> = [
    ['draft', 'Drafts to publish', drafts.length],
    ['live', 'Live models', live.length],
    ['retired', 'Retired', retired.length],
  ]

  return <div>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-navy/60">{models.length} models in registry</p>
        <p className="mt-1 text-xs text-navy/55">
          {live.length} live · {drafts.length} drafts · {retired.length} retired
        </p>
        <p className="mt-1 text-xs text-navy/55">
          {mappedCount} live models linked to catalogues · {needsAttentionCount} needing verification or review
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/retirement-review"
          className="rounded-md border border-navy/15 px-3 py-2 text-sm font-medium text-navy/70 hover:bg-navy/5">
          Retirement candidates
        </Link>
        <Link href="/admin/catalogue-review"
          className="rounded-md border border-coral/30 px-3 py-2 text-sm font-medium text-coral hover:bg-coral/5">
          Review drift{needsAttentionCount > 0 ? ` (${needsAttentionCount})` : ''}
        </Link>
        <Link href="/admin/models/new" className="btn-primary text-sm">Add Model</Link>
      </div>
    </div>
    {verification.length === 0 && <p className="mt-3 text-xs text-coral/80">
      Verification history is unavailable. Confirm that the catalogue migrations have been applied.
    </p>}

    <div role="tablist" aria-label="Model lifecycle" className="mt-6 flex flex-wrap gap-4 border-b border-cream-dark pb-3">
      {buttons.map(([value, label, count]) =>
        <button key={value} role="tab" aria-selected={tab === value} type="button"
          onClick={() => setTab(value)}
          className={`text-sm font-medium ${tab === value ? 'text-teal' : 'text-navy/50'}`}>
          {label} ({count})
        </button>
      )}
    </div>
    {tab === 'draft' && <div className="mt-5"><DraftPublishingQueue drafts={drafts} metadata={draftPublishMeta} /></div>}
    {tab === 'live' && <LiveModelsQueue models={live} verification={verification} />}
    {tab === 'retired' && <RetiredModelsQueue models={retired} verification={verification} />}
  </div>
}
