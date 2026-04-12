'use client'

import { useState, useTransition } from 'react'
import { selectModel } from '@/app/actions'
import type { ScoredModel } from '@/lib/scoring'
import type { Factor } from '@/lib/registry'

const FACTOR_LABELS: Record<Factor, string> = {
  cost: 'Cost',
  speed: 'Speed',
  quality: 'Quality',
  privacy: 'Privacy',
  sustainability: 'Sustainability',
  transparency: 'Transparency',
  capability: 'Capability',
}

const FACTORS: Factor[] = [
  'quality',
  'capability',
  'cost',
  'speed',
  'privacy',
  'sustainability',
  'transparency',
]

interface ResultsClientProps {
  taskId: string
  models: ScoredModel[]
  reasoning: Record<string, string>
}

export function ResultsClient({ taskId, models, reasoning }: ResultsClientProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSelect(modelSlug: string, rank: number) {
    setError(null)
    startTransition(async () => {
      const result = await selectModel(taskId, modelSlug, rank)
      if (result.error) {
        setError(result.error)
      } else {
        setSelectedSlug(modelSlug)
      }
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {models.map((model, index) => {
        const rank = index + 1
        const isTop = rank === 1
        const isSelected = selectedSlug === model.slug
        const isDisabled = selectedSlug !== null && !isSelected
        const matchPercent = Math.round(model.weightedScore * 100)

        return (
          <div
            key={model.slug}
            className={`rounded-lg border p-5 transition-colors ${
              isTop
                ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800/50'
                : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800'
            }`}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isTop
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {rank}
                  </span>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {model.name}
                  </h3>
                </div>
                <p className="mt-0.5 ml-9 text-sm text-zinc-500 dark:text-zinc-400">
                  {model.provider}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  {matchPercent}%
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">match</p>
              </div>
            </div>

            {/* Reasoning */}
            {reasoning[model.slug] && (
              <p className="mb-4 ml-9 text-sm text-zinc-600 dark:text-zinc-300">
                {reasoning[model.slug]}
              </p>
            )}

            {/* Factor bars */}
            <div className="mb-4 ml-9 space-y-2">
              {FACTORS.map((factor) => {
                const score = model.factorScores[factor] ?? 0
                const pct = Math.round(score * 100)
                return (
                  <div key={factor} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                      {FACTOR_LABELS[factor]}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-700">
                      <div
                        className={`h-2 rounded-full ${
                          isTop
                            ? 'bg-zinc-900 dark:bg-zinc-100'
                            : 'bg-zinc-400 dark:bg-zinc-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">
                      {pct}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Cost + action */}
            <div className="flex items-center justify-between ml-9">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                ~${model.estimatedCost.toFixed(4)} per task
              </p>
              <button
                type="button"
                onClick={() => handleSelect(model.slug, rank)}
                disabled={isPending || isDisabled}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 cursor-default'
                    : isDisabled
                      ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-700 dark:text-zinc-500 cursor-not-allowed'
                      : isTop
                        ? 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
                        : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600'
                }`}
              >
                {isSelected ? 'Selected' : 'Use this one'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
