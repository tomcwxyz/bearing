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
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-xl">
        <h1 className="mb-2 text-center text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Bearing
        </h1>
        <p className="mb-8 text-center text-zinc-500 dark:text-zinc-400">
          Find the right AI model for your task
        </p>

        {/* Mode tabs */}
        <div className="mb-6 flex rounded-lg border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setMode('recommend')}
            className={`flex-1 rounded-l-lg px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'recommend'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Recommend
          </button>
          <button
            type="button"
            onClick={() => setMode('validate')}
            className={`flex-1 rounded-r-lg px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'validate'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Validate
          </button>
        </div>

        {mode === 'validate' ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Coming in Sprint 2
            </p>
          </div>
        ) : (
          <form action={handleSubmit}>
            <label
              htmlFor="description"
              className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              What do you want to use AI for?
            </label>
            <textarea
              id="description"
              name="description"
              rows={5}
              placeholder="e.g. Summarise long legal contracts into plain-English bullet points"
              className="mb-4 w-full resize-y rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
              disabled={loading}
            />

            {error && (
              <p className="mb-4 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {loading ? 'Classifying...' : 'Find my model'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
