'use client'

import { useState, useTransition } from 'react'
import { selectModel } from '@/app/actions'
import type { ScoredModel } from '@/lib/scoring'
import type { Factor } from '@/lib/registry'
import type { PipelineResult } from '@/lib/pipeline'
import type { LocalInferenceResult } from '@/lib/local-inference'
import type { RecommendationEvidence } from '@/lib/recommendation-evidence'
import { PipelineSection } from './pipeline-section'
import { LocalSection } from './local-section'
import { RunSurface } from './run-surface'

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
  pipeline?: (PipelineResult & { reasoning: string }) | null
  local?: LocalInferenceResult | null
  evidenceBySlug: Record<string, RecommendationEvidence>
}

/** Keep the default decision small. The full ranking remains available. */
const VISIBLE_MODEL_COUNT = 3

const UNKNOWN_EVIDENCE: RecommendationEvidence = {
  level: 'unknown',
  label: 'Evidence not verified',
  detail: 'Bearing has not yet recorded a current catalogue verification for this model.',
  source: null,
  verifiedAt: null,
}

function RecommendationLabel({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="rounded-full bg-coral px-2.5 py-1 text-xs font-semibold text-white">
        Best fit
      </span>
    )
  }
  return (
    <span className="rounded-full bg-cream-dark px-2.5 py-1 text-xs font-medium text-navy/60">
      Alternative #{rank}
    </span>
  )
}

function EvidenceConfidence({ evidence }: { evidence: RecommendationEvidence }) {
  const tone = evidence.level === 'high'
    ? 'border-teal/30 bg-teal/5 text-teal'
    : evidence.level === 'low'
      ? 'border-coral/30 bg-coral/5 text-coral'
      : 'border-cream-dark bg-cream/40 text-navy/60'

  return (
    <details className={`mb-4 rounded-lg border px-3 py-2 ${tone}`}>
      <summary className="cursor-pointer text-xs font-semibold font-display">
        {evidence.label}
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-navy/70">
        {evidence.detail}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-navy/45">
        This reflects how current Bearing&apos;s catalogue evidence is, not the probability that the model will perform well.
      </p>
    </details>
  )
}

function FactorDetails({ model }: { model: ScoredModel }) {
  return (
    <details className="mt-4 ml-9 rounded-lg border border-cream-dark bg-cream/30 px-4 py-3">
      <summary className="cursor-pointer font-display text-sm font-medium text-navy">
        Why this model?
      </summary>
      <div className="mt-4 space-y-2">
        {FACTORS.map((factor) => {
          const score = model.factorScores[factor] ?? 0
          const pct = Math.min(100, Math.round(score * 100))
          return (
            <div key={factor} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-navy/60 text-xs font-mono">
                {FACTOR_LABELS[factor]}
              </span>
              <div className="h-2 flex-1 rounded-full bg-cream-dark">
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
      <p className="mt-3 text-xs leading-relaxed text-grey-blue">
        These are factor scores used in Bearing&apos;s ranking, not confidence percentages.
      </p>
    </details>
  )
}

export function ResultsClient({ taskId, models, reasoning, pipeline, local, evidenceBySlug }: ResultsClientProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [selectionId, setSelectionId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showAllModels, setShowAllModels] = useState(false)

  const visibleModels = showAllModels ? models : models.slice(0, VISIBLE_MODEL_COUNT)
  const hiddenCount = models.length - visibleModels.length

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
    <div className="space-y-4" role="list" aria-label="Model recommendations">
      {error && (
        <p role="alert" className="text-sm text-coral">{error}</p>
      )}

      {visibleModels.map((model, index) => {
        const rank = index + 1
        const isTop = rank === 1
        const isSelected = selectedSlug === model.slug
        const isDisabled = selectedSlug !== null && !isSelected
        const evidence = evidenceBySlug[model.slug] ?? UNKNOWN_EVIDENCE

        return (
          <div
            key={model.slug}
            className={`rounded-xl border p-5 transition-colors shadow-sm card-enter ${
              isTop
                ? 'border-coral border-2 bg-coral/5'
                : 'bg-white border-cream-dark'
            }`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <RecommendationLabel rank={rank} />
                  <span className="text-xs text-navy/40">{model.provider}</span>
                </div>
                <h3 className="font-display text-xl font-bold text-navy">
                  {model.name}
                </h3>
              </div>
              <span className="font-mono text-sm text-navy/35">#{rank}</span>
            </div>

            {reasoning[model.slug] && (
              <p className="mb-4 text-navy/75 text-sm leading-relaxed">
                {reasoning[model.slug]}
              </p>
            )}

            <EvidenceConfidence evidence={evidence} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-sm text-navy/60">
                ~${model.estimatedCost.toFixed(4)} per task
              </p>
              <button
                type="button"
                onClick={() => handleSelect(model.slug, rank)}
                disabled={isPending || isDisabled}
                aria-label={`Select ${model.name}`}
                className={`rounded-lg px-4 py-2 text-sm font-medium font-display transition-colors ${
                  isSelected
                    ? 'bg-teal text-cream cursor-default'
                    : isDisabled
                      ? 'bg-navy text-cream opacity-40 cursor-not-allowed'
                      : 'bg-navy text-cream hover:bg-navy-light'
                }`}
              >
                {isSelected ? 'Selected' : isTop ? 'Use this recommendation' : 'Use this instead'}
              </button>
            </div>

            <FactorDetails model={model} />

            <div className="mt-4 ml-9">
              <RunSurface taskId={taskId} modelSlug={model.slug} modelName={model.name} />
            </div>
          </div>
        )
      })}

      {hiddenCount > 0 && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowAllModels(true)}
            className="btn-secondary"
          >
            Show full ranking ({models.length} models)
          </button>
        </div>
      )}

      {showAllModels && models.length > VISIBLE_MODEL_COUNT && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowAllModels(false)}
            className="text-sm text-navy/60 underline hover:text-navy"
          >
            Show fewer
          </button>
        </div>
      )}

      {pipeline && (
        <PipelineSection
          pipeline={pipeline}
          singleModelCost={models[0]?.estimatedCost ?? 0}
        />
      )}

      {local && (
        <LocalSection local={local} />
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

      <div className="mt-8 text-center">
        <a
          href={`/compare/${taskId}`}
          className="btn-secondary"
        >
          Compare two models head-to-head
        </a>
      </div>
    </div>
  )
}
