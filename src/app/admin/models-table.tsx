'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AdminModel } from '@/db/models'
import type { ModelVerificationSummary } from '@/db/model-verification'
import { assessModelFreshness } from '@/lib/model-freshness'
import type { DraftPublishMeta } from '@/lib/draft-publish'
import DraftPublishingQueue from './draft-publishing-queue'
import LiveModelsQueue from './live-models-queue'

export default function ModelsTable({
  models, verification, draftPublishMeta,
}: {
  models: AdminModel[]
  verification: ModelVerificationSummary[]
  draftPublishMeta: DraftPublishMeta[]
}) {
  const drafts = models.filter(model => !model.active)
  const live = models.filter(model => model.active)
  const [showLive, setShowLive] = useState(drafts.length === 0)
  const activeVerification = verification.filter(row => row.active)
  const mappedCount = activeVerification.filter(row => row.providerModelId || row.openrouterId).length
  const needsAttentionCount = activeVerification.filter(row =>
    !row.providerModelId && !row.openrouterId || assessModelFreshness(row).needsAttention
  ).length

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-navy/60">{models.length} models in registry</p>
          <p className="mt-1 text-xs text-navy/55">
            {live.length} live · {drafts.length} drafts · {mappedCount} live models mapped · {needsAttentionCount} needing a check or review
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/retirement-review" className="rounded-md border border-navy/15 px-3 py-2 text-sm font-medium text-navy/70 hover:bg-navy/5">Retirement review</Link>
          <Link href="/admin/catalogue-review" className="rounded-md border border-coral/30 px-3 py-2 text-sm font-medium text-coral hover:bg-coral/5">
            Review drift{needsAttentionCount > 0 ? ` (${needsAttentionCount})` : ''}
          </Link>
          <Link href="/admin/models/new" className="btn-primary text-sm">Add Model</Link>
        </div>
      </div>
      {verification.length === 0 && <p className="mt-3 text-xs text-coral/80">
        Verification history is unavailable. Confirm that the catalogue migrations have been applied.
      </p>}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-cream-dark pb-3">
        <button type="button" onClick={() => setShowLive(false)}
          className={`text-sm font-medium ${!showLive ? 'text-teal' : 'text-navy/50'}`}>Drafts to publish ({drafts.length})</button>
        <button type="button" onClick={() => setShowLive(true)}
          className={`text-sm font-medium ${showLive ? 'text-teal' : 'text-navy/50'}`}>Live models ({live.length})</button>
      </div>
      {showLive
        ? <LiveModelsQueue models={live} verification={verification} />
        : <div className="mt-5"><DraftPublishingQueue drafts={drafts} metadata={draftPublishMeta} /></div>}
    </div>
  )
}
