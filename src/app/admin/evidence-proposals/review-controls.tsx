'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reviewModelEvidence } from './actions'

export function ReviewControls({ id, disabled }: { id: string; disabled: boolean }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function review(decision: 'accept' | 'reject') {
    setError(null)
    startTransition(async () => {
      try {
        const result = await reviewModelEvidence(id, decision, note)
        if (!result.ok) setError(result.message)
        else router.refresh()
      } catch {
        setError('Review failed. Check database migration 036 and retry.')
      }
    })
  }

  return (
    <div className="mt-4 space-y-3 border-t border-cream-dark pt-4">
      <label className="block text-sm font-medium text-navy" htmlFor={'note-' + id}>
        Review note (required for rejection)
      </label>
      <textarea
        id={'note-' + id} rows={2} value={note} onChange={e => setNote(e.target.value)}
        maxLength={2000} placeholder="What did you check? Why accept, defer or reject?"
        className="w-full rounded-lg border border-cream-dark p-3 text-sm text-navy"
      />
      {error && <p role="alert" className="text-sm text-coral">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={pending || disabled} onClick={() => review('accept')}
          className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? 'Saving…' : 'Accept and apply to Neon'}
        </button>
        <button type="button" disabled={pending} onClick={() => review('reject')}
          className="rounded-lg border border-cream-dark px-4 py-2 text-sm font-semibold text-navy disabled:opacity-40">
          Reject with reason
        </button>
      </div>
    </div>
  )
}
