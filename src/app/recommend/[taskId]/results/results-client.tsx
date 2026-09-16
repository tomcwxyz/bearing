'use client'

import { useMemo, useState, useTransition } from 'react'
import { selectModel } from '@/features/feedback/actions'
import type { ScoredModel } from '@/lib/scoring'
import type { Factor } from '@/lib/registry'
import type { PipelineResult } from '@/lib/pipeline'
import type { LocalInferenceResult } from '@/lib/local-inference'
import type { BenchmarkEvidence } from '@/lib/benchmark-evidence'
import type { ModelOutcomeEvidence } from '@/lib/outcome-evidence'
import type { RecommendationEvidence } from '@/lib/recommendation-evidence'
import type { RecommendationConfidence } from '@/lib/recommendation-confidence'
import type { FeaturedAlternative } from '@/lib/tradeoff-alternatives'
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
  outcomeBySlug: Record<string, ModelOutcomeEvidence>
  benchmarkBySlug: Record<string, BenchmarkEvidence>
  featuredAlternatives: FeaturedAlternative[]
  decisionConfidence: RecommendationConfidence
}

const UNKNOWN_EVIDENCE: RecommendationEvidence = {
  level: 'unknown',
  label: 'Evidence not verified',
  detail: 'Bearing has not yet recorded a current catalogue verification for this model.',
  source: null,
  verifiedAt: null,
}

function RecommendationLabel({
  rank,
  alternative,
}: {
  rank: number
  alternative?: FeaturedAlternative
}) {
  if (rank === 1) {
    return (
      <span className="rounded-full bg-coral px-2.5 py-1 text-xs font-semibold text-white">
        Best fit
      </span>
    )
  }

  if (!alternative) return null

  return (
    <span className="rounded-full bg-cream-dark px-2.5 py-1 text-xs font-medium text-navy/70">
      {alternative.label}
    </span>
  )
}

function DecisionConfidence({ confidence }: { confidence: RecommendationConfidence }) {
  const tone = confidence.level === 'high'
    ? 'border-teal/30 bg-teal/5'
    : confidence.level === 'low'
      ? 'border-coral/30 bg-coral/5'
      : 'border-cream-dark bg-cream/50'
  const labelTone = confidence.level === 'high'
    ? 'text-teal'
    : confidence.level === 'low'
      ? 'text-coral'
      : 'text-navy/65'

  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <p className={`font-display text-sm font-semibold ${labelTone}`}>
        {confidence.label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-navy/70">
        {confidence.detail}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-navy/45">
        This describes the strength of the decision evidence, not a probability that the answer will be correct.
      </p>
    </div>
  )
}

function EvidenceConfidence({ evidence }: { evidence: RecommendationEvidence }) {
  const tone = evidence.level === 'high'
    ? 'border-teal/30 bg-teal/5 text-teal'
    : evidence.level === 'low'
      ? 'border-coral/30 bg-coral/5 text-coral'
      : 'border-cream-dark bg-cream/40 text-navy/60'

  return (
    <details className={`mb-3 rounded-lg border px-3 py-2 ${tone}`}>
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

function BenchmarkEvidenceDisclosure({ evidence }: { evidence: BenchmarkEvidence }) {
  const tone = evidence.agreement === 'strong_disagreement'
    ? 'border-coral/30 bg-coral/5 text-coral'
    : evidence.agreement === 'tension'
      ? 'border-cream-dark bg-cream/50 text-navy/65'
      : evidence.agreement === 'aligned'
        ? 'border-teal/25 bg-teal/5 text-teal'
        : 'border-cream-dark bg-white text-navy/50'

  return (
    <details className={`mb-3 rounded-lg border px-3 py-2 ${tone}`}>
      <summary className="cursor-pointer text-xs font-semibold font-display">
        {evidence.label}
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-navy/70">
        {evidence.detail}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-navy/45">
        This compares external benchmark evidence with Bearing&apos;s curated task score. When benchmark blending is enabled, fresh broad evidence receives more ranking influence and sparse or stale evidence is automatically down-weighted. Disagreement still lowers decision confidence and can prompt a challenge.
      </p>
    </details>
  )
}

function OutcomeEvidence({ evidence }: { evidence: ModelOutcomeEvidence }) {
  const tone = evidence.level === 'supported'
    ? 'border-teal/25 bg-teal/5 text-teal'
    : evidence.level === 'early'
      ? 'border-cream-dark bg-cream/40 text-navy/65'
      : 'border-cream-dark bg-white text-navy/50'

  return (
    <details className={`mb-4 rounded-lg border px-3 py-2 ${tone}`}>
      <summary className="cursor-pointer text-xs font-semibold font-display">
        {evidence.label}
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-navy/70">
        {evidence.detail}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-navy/45">
        Human signals combine explicit outcomes and preferences. Blind-judge picks are reported separately and never count as human evidence. This evidence is not yet used to change the ranking.
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

export function ResultsClient({
  taskId,
  models,
  reasoning,
  pipeline,
  local,
  evidenceBySlug,
  outcomeBySlug,
  benchmarkBySlug,
  featuredAlternatives,
  decisionConfidence,
}: ResultsClientProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [selectionId, setSelectionId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showAllModels, setShowAllModels] = useState(false)

  const rankBySlug = useMemo(
    () => new Map(models.map((model, index) => [model.slug, index + 1])),
    [models],
  )
  const alternativesBySlug = useMemo(
    () => new Map(featuredAlternatives.map((alternative) => [alternative.slug, alternative])),
    [featuredAlternatives],
  )

  const visibleModels = useMemo(() => {
    if (showAllModels) return models
    const featuredSlugs = [models[0]?.slug, ...featuredAlternatives.map((alternative) => alternative.slug)]
      .filter((slug): slug is string => Boolean(slug))
    const modelBySlug = new Map(models.map((model) => [model.slug, model]))
    return featuredSlugs
      .map((slug) => modelBySlug.get(slug))
      .filter((model): model is ScoredModel => Boolean(model))
  }, [featuredAlternatives, models, showAllModels])

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

      <DecisionConfidence confidence={decisionConfidence} />

      {visibleModels.map((model, index) => {
        const rank = rankBySlug.get(model.slug) ?? index + 1
        const isTop = rank === 1
        const alternative = alternativesBySlug.get(model.slug)
        const isSelected = selectedSlug === model.slug
        const isDisabled = selectedSlug !== null && !isSelected
        const evidence = evidenceBySlug[model.slug] ?? UNKNOWN_EVIDENCE
        const benchmark = benchmarkBySlug[model.slug]
        const outcomes = outcomeBySlug[model.slug]

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
                  <RecommendationLabel rank={rank} alternative={alternative} />
                  <span className="text-xs text-navy/40">{model.provider}</span>
                </div>
                <h3 className="font-display text-xl font-bold text-navy">
                  {model.name}
                </h3>
              </div>
              <span className="font-mono text-sm text-navy/35">#{rank}</span>
            </div>

            {alternative && (
              <div className="mb-4 rounded-lg border border-teal/20 bg-teal/5 px-3 py-2">
                <p className="text-xs font-semibold font-display text-teal">Why this alternative</p>
                <p className="mt-1 text-sm leading-relaxed text-navy/70">{alternative.reason}</p>
              </div>
            )}

            {reasoning[model.slug] && (
              <p className="mb-4 text-navy/75 text-sm leading-relaxed">
                {reasoning[model.slug]}
              </p>
            )}

            <EvidenceConfidence evidence={evidence} />
            {benchmark && <BenchmarkEvidenceDisclosure evidence={benchmark} />}
            {outcomes && <OutcomeEvidence evidence={outcomes} />}

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

      {hiddenCount > 0 && !showAllModels && (
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

      {showAllModels && models.length > 1 + featuredAlternatives.length && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowAllModels(false)}
            className="text-sm text-navy/60 underline hover:text-navy"
          >
            Show best fit and trade-off alternatives
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
