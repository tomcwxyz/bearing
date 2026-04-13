'use client'

import { useState, useTransition, useEffect, use } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { submitPreference } from '@/app/actions'

interface ComparisonData {
  comparisonId: string
  modelASlug: string
  modelBSlug: string
  modelAName: string
  modelBName: string
  responseA: string
  responseB: string
  errorA: string
  errorB: string
}

export default function CompareResultsPage({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = use(params)
  const [data, setData] = useState<ComparisonData | null>(null)
  const [preferred, setPreferred] = useState<'model_a' | 'model_b' | 'tie' | null>(null)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const cid = urlParams.get('cid')
    if (!cid) {
      setError('No comparison ID found.')
      return
    }

    const stored = sessionStorage.getItem(`comparison:${cid}`)
    if (!stored) {
      setError('Comparison data not found. Please run the comparison again.')
      return
    }

    setData(JSON.parse(stored))
  }, [])

  function handleSubmit() {
    if (!data || !preferred) return
    setError(null)
    startTransition(async () => {
      const result = await submitPreference(
        data.comparisonId,
        preferred,
        reason.trim() || null,
      )
      if ('error' in result && result.error) {
        setError(result.error)
      } else {
        setSubmitted(true)
        sessionStorage.removeItem(`comparison:${data.comparisonId}`)
      }
    })
  }

  if (error && !data) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto text-center py-16">
          <p className="text-coral mb-4">{error}</p>
          <Link href={`/compare/${taskId}`} className="btn-secondary">
            Try again
          </Link>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-grey-blue">Loading...</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto text-center py-16">
          <div className="rounded-xl border border-teal/30 bg-teal/5 p-8 max-w-lg mx-auto">
            <h2 className="text-2xl font-bold font-display text-navy mb-3">
              Thanks for your feedback
            </h2>
            <p className="text-navy/70 mb-6">
              Your preference helps improve model recommendations for everyone.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={`/compare/${taskId}`} className="btn-secondary">
                Compare again
              </Link>
              <Link href={`/recommend/${taskId}/results`} className="btn-primary">
                Back to results
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <Link
          href={`/compare/${taskId}`}
          className="text-sm text-teal hover:underline mb-4 inline-block"
        >
          &larr; Back to compare
        </Link>
        <h2 className="text-2xl font-bold mb-6 font-display text-navy">
          Side-by-side comparison
        </h2>

        {error && (
          <div className="mb-6 rounded-lg border border-coral/30 bg-coral/5 p-4">
            <p className="text-sm text-coral">{error}</p>
          </div>
        )}

        {/* Side-by-side responses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {/* Model A */}
          <div className="rounded-xl border-l-4 border-l-teal border border-cream-dark bg-white p-5">
            <h3 className="font-display font-bold text-navy text-lg mb-1">
              {data.modelAName}
            </h3>
            <p className="text-xs text-grey-blue mb-4">{data.modelASlug}</p>
            {data.errorA ? (
              <p className="text-coral text-sm italic">{data.errorA}</p>
            ) : (
              <div className="prose prose-sm max-w-none text-navy/80 font-body prose-headings:text-navy prose-headings:font-display prose-strong:text-navy prose-a:text-teal prose-code:text-navy prose-code:bg-cream prose-code:px-1 prose-code:rounded prose-pre:bg-navy prose-pre:text-cream prose-th:text-navy prose-td:border-cream-dark">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {data.responseA}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Model B */}
          <div className="rounded-xl border-l-4 border-l-coral border border-cream-dark bg-white p-5">
            <h3 className="font-display font-bold text-navy text-lg mb-1">
              {data.modelBName}
            </h3>
            <p className="text-xs text-grey-blue mb-4">{data.modelBSlug}</p>
            {data.errorB ? (
              <p className="text-coral text-sm italic">{data.errorB}</p>
            ) : (
              <div className="prose prose-sm max-w-none text-navy/80 font-body prose-headings:text-navy prose-headings:font-display prose-strong:text-navy prose-a:text-teal prose-code:text-navy prose-code:bg-cream prose-code:px-1 prose-code:rounded prose-pre:bg-navy prose-pre:text-cream prose-th:text-navy prose-td:border-cream-dark">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {data.responseB}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>

        {/* Preference voting */}
        <div className="rounded-xl border border-cream-dark bg-white p-6">
          <h3 className="font-display font-bold text-navy text-lg mb-4">
            Which response did you prefer?
          </h3>

          <div className="flex flex-wrap gap-3 mb-6">
            <button
              type="button"
              onClick={() => setPreferred('model_a')}
              className={`rounded-lg px-5 py-2.5 text-sm font-display font-semibold transition-all ${
                preferred === 'model_a'
                  ? 'bg-teal text-white shadow-md'
                  : 'border border-teal text-teal hover:bg-teal/5'
              }`}
            >
              {data.modelAName}
            </button>
            <button
              type="button"
              onClick={() => setPreferred('model_b')}
              className={`rounded-lg px-5 py-2.5 text-sm font-display font-semibold transition-all ${
                preferred === 'model_b'
                  ? 'bg-coral text-white shadow-md'
                  : 'border border-coral text-coral hover:bg-coral/5'
              }`}
            >
              {data.modelBName}
            </button>
            <button
              type="button"
              onClick={() => setPreferred('tie')}
              className={`rounded-lg px-5 py-2.5 text-sm font-display font-semibold transition-all ${
                preferred === 'tie'
                  ? 'bg-navy text-cream shadow-md'
                  : 'border border-navy text-navy hover:bg-navy/5'
              }`}
            >
              About the same
            </button>
          </div>

          {preferred && (
            <>
              <label
                htmlFor="preference-reason"
                className="block text-sm text-navy/70 mb-2"
              >
                Why? <span className="text-grey-blue">(optional)</span>
              </label>
              <textarea
                id="preference-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                disabled={isPending}
                className="w-full rounded-lg border border-cream-dark bg-cream p-3 text-navy font-body text-sm resize-y focus:border-teal focus:ring-1 focus:ring-teal mb-4"
                placeholder="e.g. More accurate, better structured, more concise..."
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="btn-primary disabled:opacity-40"
              >
                {isPending ? 'Submitting...' : 'Submit preference'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
