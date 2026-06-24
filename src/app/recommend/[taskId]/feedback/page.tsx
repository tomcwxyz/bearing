'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { submitOutcome } from '@/app/actions'

const FAILURE_REASONS = [
  'Too slow',
  'Poor quality output',
  'Too expensive',
  "Couldn't do what I needed",
  'Other',
]

export default function FeedbackPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const searchParams = useSearchParams()
  const selectionId = searchParams.get('selectionId') ?? ''

  const [success, setSuccess] = useState<boolean | null>(null)
  const [failureReason, setFailureReason] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (success === null) return
    setSubmitting(true)
    setError(null)

    try {
      const result = await submitOutcome(
        taskId,
        selectionId,
        success,
        failureReason,
        feedback.trim() || null,
      )

      if (result && 'error' in result && result.error) {
        setError(result.error)
        setSubmitting(false)
        return
      }

      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md px-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-light">
            <svg
              className="h-6 w-6 text-teal"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight font-display text-teal">
            Thanks for your feedback
          </h1>
          <p className="mt-2 text-sm text-grey-blue">
            Your input helps us improve recommendations for everyone.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-navy px-6 py-2.5 text-sm font-medium font-display text-cream transition-colors hover:bg-navy-light"
          >
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  const canSubmit = success !== null && (success || failureReason !== null)

  return (
    <div className="flex flex-1 flex-col items-center">
      <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-16 sm:py-24">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display text-navy">
            How did it go?
          </h1>
          <p className="mt-2 text-base text-grey-blue">
            Let us know how the recommended model worked for your task.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-coral bg-coral/5 px-4 py-3 text-sm text-coral">
            {error}
          </div>
        )}

        {/* Outcome buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => {
              setSuccess(true)
              setFailureReason(null)
            }}
            className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 px-6 py-6 text-sm font-medium transition-colors ${
              success === true
                ? 'border-teal bg-teal text-cream'
                : 'border-teal text-teal hover:bg-teal hover:text-cream'
            } cursor-pointer`}
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m.729-14.456a3 3 0 0 0-2.588 1.495L2.747 8.27a4.5 4.5 0 0 0-.587 2.235v.907c0 1.063.722 2.005 1.762 2.174a23.95 23.95 0 0 0 2.711.322M6.633 10.25v4.337" />
            </svg>
            Worked well
          </button>
          <button
            onClick={() => setSuccess(false)}
            className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 px-6 py-6 text-sm font-medium transition-colors ${
              success === false
                ? 'border-coral bg-coral text-cream'
                : 'border-coral text-coral hover:bg-coral hover:text-cream'
            } cursor-pointer`}
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 0 1 2.25 12c0-2.848.992-5.464 2.649-7.521C5.287 3.997 5.886 3.75 6.504 3.75h4.369c.483 0 .964.078 1.423.23l3.114 1.04a4.501 4.501 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.5a2.25 2.25 0 0 0 2.25 2.25.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.861-2.4c.498-.634 1.226-1.08 2.032-1.08h.384" />
            </svg>
            Not great
          </button>
        </div>

        {/* Failure reason pills */}
        {success === false && (
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-medium text-navy">
              What went wrong?
            </h2>
            <div className="flex flex-wrap gap-2">
              {FAILURE_REASONS.map((reason) => {
                const selected = failureReason === reason
                return (
                  <button
                    key={reason}
                    onClick={() => setFailureReason(reason)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-navy text-cream border-navy'
                        : 'border-cream-dark text-navy hover:border-navy'
                    } cursor-pointer`}
                  >
                    {reason}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Free-text feedback */}
        {success !== null && (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="feedback"
              className="text-sm font-medium text-navy"
            >
              Anything else?
            </label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="Optional — tell us more about your experience"
              className="resize-none rounded-lg border border-cream-dark bg-white px-4 py-3 text-sm text-navy placeholder-grey-blue outline-none transition-colors focus:ring-teal focus:border-teal"
            />
          </div>
        )}

        {/* Submit */}
        {success !== null && (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={`self-start rounded-full px-8 py-2.5 text-sm font-medium font-display transition-colors ${
              canSubmit && !submitting
                ? 'bg-navy text-cream hover:bg-navy-light cursor-pointer'
                : 'bg-navy text-cream opacity-40 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-cream" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path d="M24 3a21 21 0 0 1 14.85 6.15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Submitting...
              </span>
            ) : (
              'Submit feedback'
            )}
          </button>
        )}
      </main>
    </div>
  )
}
