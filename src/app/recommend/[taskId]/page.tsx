'use client'

import { useState, useEffect, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
  const router = useRouter()

  const [questions, setQuestions] = useState<Question[]>([])
  const [description, setDescription] = useState('')
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [isPending, startTransition] = useTransition()
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
    if (isPending) return
    setAnswers((prev) => ({ ...prev, [index]: option }))
  }

  const allAnswered = questions.length > 0 && questions.every((_, i) => answers[i] !== undefined)

  function handleSubmit() {
    setError(null)

    const clarifications: ClarificationAnswer[] = questions.map((q, i) => ({
      question: q.question,
      answer: answers[i],
    }))

    startTransition(async () => {
      try {
        const result = await submitClarification(taskId, description, clarifications)

        if (result && 'error' in result && result.error) {
          setError(result.error)
          return
        }

        // If more clarification is needed (max 2 rounds)
        if (result && 'needsClarification' in result && result.needsClarification && round < 2) {
          setQuestions(result.questions ?? [])
          setAnswers({})
          setRound(2)
          return
        }

        // If we hit max rounds and still need clarification
        if (result && 'needsClarification' in result && result.needsClarification && round >= 2) {
          setError('Unable to classify your task with enough confidence. Please try rephrasing your description.')
          return
        }

        // If no result returned, the redirect happened server-side.
        // But if we somehow get here, push manually.
        if (!result) {
          router.push(`/recommend/${taskId}/priorities`)
        }
      } catch {
        // redirect() from server action may throw on client — navigate manually
        router.push(`/recommend/${taskId}/priorities`)
      }
    })
  }

  if (error && !ready) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md px-6 text-center">
          <p className="text-lg text-coral">{error}</p>
          <a
            href="/"
            className="mt-6 inline-block rounded-full bg-navy px-6 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-navy-light"
          >
            Start over
          </a>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cream-dark border-t-teal" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center">
      <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-16 sm:py-24">
        <div>
          <p className="text-sm font-medium text-grey-blue">
            Round {round} of 2
          </p>
          <h1 className="mt-2 font-display text-2xl text-navy">
            A few quick questions
          </h1>
          <p className="mt-2 text-base text-grey-blue">
            Help us understand your task better so we can recommend the right model.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-coral/30 bg-coral/5 px-4 py-3 text-sm text-coral">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-8">
          {questions.map((q, qi) => (
            <div key={`${round}-${qi}`} className="flex flex-col gap-3">
              <h2 className="font-display font-medium text-navy">
                {q.question}
              </h2>
              <div className="flex flex-wrap gap-2">
                {q.options.map((option) => {
                  const selected = answers[qi] === option
                  return (
                    <button
                      key={option}
                      onClick={() => selectAnswer(qi, option)}
                      disabled={isPending}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        selected
                          ? 'border-navy bg-navy text-cream'
                          : 'border-cream-dark text-navy hover:border-teal hover:text-teal'
                      } ${isPending ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {allAnswered && (
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full rounded-lg bg-navy px-4 py-3 font-display text-sm font-semibold text-cream transition-colors hover:bg-navy-light disabled:opacity-50"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />
                Classifying...
              </span>
            ) : (
              'Continue'
            )}
          </button>
        )}
      </main>
    </div>
  )
}
