'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { submitClarification } from '@/app/actions'
import type { ClarificationAnswer } from '@/lib/classification'

interface Question {
  question: string
  options: string[]
}

interface ClarifyData {
  questions: Question[]
  description: string
}

export default function ClarificationPage() {
  const { taskId } = useParams<{ taskId: string }>()

  const [questions, setQuestions] = useState<Question[]>([])
  const [description, setDescription] = useState('')
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState(1)
  const [ready, setReady] = useState(false)

  // Load clarification data from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem(`clarify-${taskId}`)
    if (!raw) {
      setError('No clarification data found. Please start over.')
      return
    }
    try {
      const data: ClarifyData = JSON.parse(raw)
      setQuestions(data.questions)
      setDescription(data.description)
      setReady(true)
    } catch {
      setError('Invalid clarification data. Please start over.')
    }
  }, [taskId])

  function selectAnswer(index: number, option: string) {
    if (loading) return
    setAnswers((prev) => ({ ...prev, [index]: option }))
  }

  const allAnswered = questions.length > 0 && questions.every((_, i) => answers[i] !== undefined)

  // Auto-submit when all questions are answered
  useEffect(() => {
    if (!allAnswered || loading) return

    async function submit() {
      setLoading(true)
      setError(null)

      const clarifications: ClarificationAnswer[] = questions.map((q, i) => ({
        question: q.question,
        answer: answers[i],
      }))

      try {
        const result = await submitClarification(taskId, description, clarifications)

        if (result && 'error' in result && result.error) {
          setError(result.error)
          setLoading(false)
          return
        }

        // If more clarification is needed (max 2 rounds)
        if (result && 'needsClarification' in result && result.needsClarification && round < 2) {
          setQuestions(result.questions ?? [])
          setAnswers({})
          setRound(2)
          setLoading(false)
          return
        }

        // If we hit max rounds and still need clarification, show a message
        if (result && 'needsClarification' in result && result.needsClarification && round >= 2) {
          setError('Unable to classify your task with enough confidence. Please try rephrasing your description.')
          setLoading(false)
          return
        }

        // If the server action redirected, this code won't execute.
        // If we somehow get here without a redirect or error, just wait.
      } catch {
        // redirect() from server actions throws — Next.js handles it
        // Any other error is unexpected
        setError('Something went wrong. Please try again.')
        setLoading(false)
      }
    }

    submit()
  }, [allAnswered, loading, answers, questions, taskId, description, round])

  if (error && !ready) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="max-w-md px-6 text-center">
          <p className="text-lg text-zinc-600 dark:text-zinc-400">{error}</p>
          <a
            href="/"
            className="mt-6 inline-block rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Start over
          </a>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-16 sm:py-24">
        <div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Round {round} of 2
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            A few quick questions
          </h1>
          <p className="mt-2 text-base text-zinc-500 dark:text-zinc-400">
            Help us understand your task better so we can recommend the right model.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-8">
          {questions.map((q, qi) => (
            <div key={`${round}-${qi}`} className="flex flex-col gap-3">
              <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                {q.question}
              </h2>
              <div className="flex flex-wrap gap-2">
                {q.options.map((option) => {
                  const selected = answers[qi] === option
                  return (
                    <button
                      key={option}
                      onClick={() => selectAnswer(qi, option)}
                      disabled={loading}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        selected
                          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800'
                      } ${loading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-3 pt-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Re-classifying your task...
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
