'use client'

import { useState, useTransition } from 'react'
import {
  archiveLegacyDraftsAdmin,
  restoreRetiredModelsAdmin,
  retireLiveModelsAdmin,
} from './model-lifecycle-actions'

export type LifecycleOperation = 'retire' | 'restore' | 'legacy'

const COPY: Record<LifecycleOperation, {
  title: string
  description: string
  confirm: string
  submit: string
  placeholder: string
}> = {
  retire: {
    title: 'Retire selected live models',
    description: 'They will stop appearing in recommendations. Historical data, ratings and identifiers remain for audit and possible restoration.',
    confirm: 'I understand these models will leave the live catalogue.',
    submit: 'Retire models',
    placeholder: 'e.g. Provider has withdrawn the API model or a replacement supersedes it',
  },
  restore: {
    title: 'Restore selected models to live',
    description: 'These models will immediately be eligible for public recommendations again. Confirm they are available and suitable before restoring.',
    confirm: 'I have reviewed these models and want to make them live again.',
    submit: 'Restore models',
    placeholder: 'e.g. Provider restored this model and its route was checked',
  },
  legacy: {
    title: 'Archive formerly live models',
    description: 'Only use this for older records that were previously live but are still shown as drafts because we have no historical publication evidence. Ordinary unpublished drafts should remain drafts.',
    confirm: 'I confirm these are previously published legacy records, not new drafts.',
    submit: 'Move to retired',
    placeholder: 'e.g. Was live before the lifecycle migration; provider retired this model',
  },
}

export default function LifecycleBatchDialog({
  operation, selected, onCancel, onComplete,
}: {
  operation: LifecycleOperation
  selected: string[]
  onCancel: () => void
  onComplete: (result: { changed: string[]; skipped: string[] }) => void
}) {
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const copy = COPY[operation]

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        const action = operation === 'retire'
          ? retireLiveModelsAdmin
          : operation === 'restore' ? restoreRetiredModelsAdmin : archiveLegacyDraftsAdmin
        const result = await action(selected, reason, acknowledged)
        onComplete(result)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to change model status')
      }
    })
  }

  return (
    <div className="rounded-lg border border-coral/25 bg-white p-5 space-y-3">
      <div>
        <h3 className="font-display text-xl text-navy">{copy.title}</h3>
        <p className="mt-1 text-sm text-navy/70">{copy.description}</p>
        <p className="mt-2 text-xs text-navy/60">{selected.length} selected · status changes are audited · no records are deleted</p>
      </div>
      <details className="text-xs text-navy/65">
        <summary className="cursor-pointer text-teal">View selected model IDs</summary>
        <ul className="mt-2 max-h-32 overflow-y-auto font-mono">
          {selected.map(slug => <li key={slug}>{slug}</li>)}
        </ul>
      </details>
      <label className="block text-sm font-medium text-navy" htmlFor="lifecycle-reason">
        Reason for this change
      </label>
      <textarea id="lifecycle-reason" className="input-field w-full" rows={2}
        value={reason} maxLength={500} onChange={event => setReason(event.target.value)}
        placeholder={copy.placeholder} />
      <label className="flex items-start gap-2 text-sm text-navy">
        <input type="checkbox" className="mt-1 accent-teal" checked={acknowledged}
          onChange={event => setAcknowledged(event.target.checked)} />
        <span>{copy.confirm}</span>
      </label>
      {error && <p role="alert" className="text-sm text-coral">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary text-sm disabled:opacity-40"
          disabled={busy || !acknowledged || reason.trim().length < 4 || selected.length === 0}
          onClick={submit}>
          {busy ? 'Updating…' : `${copy.submit} (${selected.length})`}
        </button>
        <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
