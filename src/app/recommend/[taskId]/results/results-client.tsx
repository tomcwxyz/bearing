'use client'

import { useState, useTransition } from 'react'
import { selectModel } from '@/app/actions'
import type { ScoredModel } from '@/lib/scoring'
import type { Factor } from '@/lib/registry'
import type { PipelineResult } from '@/lib/pipeline'
import { PipelineSection } from './pipeline-section'

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
  isAuthenticated?: boolean
  pipeline?: (PipelineResult & { reasoning: string }) | null
}

export function ResultsClient({ taskId, models, reasoning, isAuthenticated, pipeline }: ResultsClientProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [selectionId, setSelectionId] = useState<string | null>(null)
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
        setSelectionId(result.selectionId ?? null)
      }
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-coral">{error}</p>
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
            className={`rounded-xl border p-5 transition-colors shadow-sm ${
              isTop
                ? 'border-coral border-2 bg-coral/5'
                : 'bg-white border-cream-dark'
            }`}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-lg font-bold ${
                      isTop
                        ? 'bg-coral text-white'
                        : 'bg-cream-dark text-navy'
                    }`}
                  >
                    {rank}
                  </span>
                  <h3 className="font-display text-xl font-bold text-navy">
                    {model.name}
                  </h3>
                </div>
                <p className="mt-0.5 ml-9 text-navy/60 text-sm">
                  {model.provider}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-3xl font-bold text-navy">
                  {matchPercent}%
                </p>
                <p className="text-grey-blue text-xs">match</p>
              </div>
            </div>

            {/* Reasoning */}
            {reasoning[model.slug] && (
              <p className="mb-4 ml-9 text-navy/70 italic text-sm leading-relaxed">
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
                    <span className="w-28 shrink-0 text-navy/60 text-xs font-mono">
                      {FACTOR_LABELS[factor]}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-cream-dark">
                      <div
                        className="h-2 rounded-full bg-teal"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-navy/70 text-xs font-mono font-semibold">
                      {pct}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Cost + action */}
            <div className="flex items-center justify-between ml-9">
              <p className="font-mono text-sm text-navy/60">
                ~${model.estimatedCost.toFixed(4)} per task
              </p>
              <button
                type="button"
                onClick={() => handleSelect(model.slug, rank)}
                disabled={isPending || isDisabled}
                className={`rounded-lg px-4 py-2 text-sm font-medium font-display transition-colors ${
                  isSelected
                    ? 'bg-teal text-cream cursor-default'
                    : isDisabled
                      ? 'bg-navy text-cream opacity-40 cursor-not-allowed'
                      : 'bg-navy text-cream hover:bg-navy-light'
                }`}
              >
                {isSelected ? 'Selected' : 'Use this one'}
              </button>
            </div>
          </div>
        )
      })}

      {pipeline && (
        <PipelineSection
          pipeline={pipeline}
          singleModelCost={models[0]?.estimatedCost ?? 0}
        />
      )}

      {selectionId && (
        <div className="mt-8 rounded-lg border border-teal/30 bg-teal/5 p-6 text-center">
          <p className="mb-3 font-display text-navy">
            Try it out, then let us know how it went
          </p>
          <a
            href={`/recommend/${taskId}/feedback?selectionId=${selectionId}`}
            className="inline-block rounded-lg border border-navy px-6 py-2.5 font-display text-sm font-semibold text-navy transition-colors hover:bg-navy hover:text-cream"
          >
            Give feedback
          </a>
          <p className="mt-2 text-xs text-grey-blue">
            Bookmark this link to come back later
          </p>
        </div>
      )}

      {isAuthenticated && (
        <div className="mt-8 text-center">
          <a
            href={`/compare/${taskId}`}
            className="btn-secondary"
          >
            Compare two models head-to-head
          </a>
        </div>
      )}
    </div>
  )
}
