'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitTask } from './actions'

export default function Home() {
  const [mode, setMode] = useState<'recommend' | 'validate'>('recommend')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    try {
      const result = await submitTask(formData)
      if (result?.error) {
        setError(result.error)
        setLoading(false)
      } else if (result?.needsClarification) {
        sessionStorage.setItem(
          `clarify-${result.taskId}`,
          JSON.stringify({
            questions: result.questions,
            description: result.description,
          }),
        )
        router.push(`/recommend/${result.taskId}`)
      }
      // If no result returned, redirect happened in server action
    } catch {
      // redirect() throws — let Next.js handle it
      // Any other unexpected error:
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-20">
      <div className="w-full max-w-xl">
        <h1 className="mb-3 text-center font-display text-5xl font-bold tracking-tight text-navy">
          Bearing
        </h1>
        <p className="mb-10 text-center text-lg text-grey-blue">
          Chart your course to the right AI model
        </p>

        {/* Mode tabs */}
        <div className="mb-8 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('recommend')}
            className={`flex-1 rounded-lg px-4 py-2.5 font-display text-sm font-semibold transition-colors ${
              mode === 'recommend'
                ? 'bg-navy text-cream'
                : 'bg-cream-dark text-navy hover:bg-navy hover:text-cream'
            }`}
          >
            Recommend
          </button>
          <button
            type="button"
            onClick={() => setMode('validate')}
            className={`flex-1 rounded-lg px-4 py-2.5 font-display text-sm font-semibold transition-colors ${
              mode === 'validate'
                ? 'bg-navy text-cream'
                : 'bg-cream-dark text-navy hover:bg-navy hover:text-cream'
            }`}
          >
            Validate
          </button>
        </div>

        {mode === 'validate' ? (
          <div className="rounded-lg border border-cream-dark bg-cream p-8 text-center">
            <p className="text-sm text-grey-blue">
              Coming in Sprint 2
            </p>
          </div>
        ) : (
          <form action={handleSubmit}>
            <label
              htmlFor="description"
              className="mb-2 block font-display text-sm font-medium text-navy"
            >
              What do you want to use AI for?
            </label>
            <textarea
              id="description"
              name="description"
              rows={5}
              placeholder="e.g. Summarise long legal contracts into plain-English bullet points"
              className="mb-4 w-full resize-y rounded-lg border border-cream-dark bg-white px-4 py-3 text-sm text-navy placeholder-grey-blue-light focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              disabled={loading}
            />

            {error && (
              <p className="mb-4 text-sm text-coral">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-navy px-4 py-3 font-display text-sm font-semibold text-cream transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              {loading ? (
                <span className="text-teal-light">Classifying...</span>
              ) : (
                'Find my model'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
