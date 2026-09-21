'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { selectModel } from '@/features/feedback/actions'
import type { ScoredModel } from '@/lib/scoring'
import { getModel, type Factor } from '@/lib/registry'
import type { PipelineResult } from '@/lib/pipeline'
import type { LocalInferenceResult } from '@/lib/local-inference'
import type { BenchmarkEvidence } from '@/lib/benchmark-evidence'
import type { ModelOutcomeEvidence } from '@/lib/outcome-evidence'
import type { RecommendationEvidence } from '@/lib/recommendation-evidence'
import type { RecommendationConfidence } from '@/lib/recommendation-confidence'
import type { FeaturedAlternative } from '@/lib/tradeoff-alternatives'
import { buildSelectionChoiceContext } from '@/lib/selection-context'
import { getReviewedOpenLocalEvidence } from '@/lib/open-local-evidence'
import {
  OPEN_WEIGHTS_THRESHOLD,
  assessHardwareFit,
  type HardwareProfile,
} from '@/lib/open-local-models'
import { PipelineSection } from './pipeline-section'
import { LocalSection } from './local-section'
import { RunSurface } from './run-surface'
import {
  HardwareProfilePanel,
  type HardwareProfileChangeSource,
} from './hardware-profile-panel'

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
  deviceView,
  isFirstVisible,
}: {
  rank: number
  alternative?: FeaturedAlternative
  deviceView: boolean
  isFirstVisible: boolean
}) {
  if (deviceView && isFirstVisible) {
    return (
      <span className="rounded-full bg-teal px-2.5 py-1 text-xs font-semibold text-white">
        Best on this device
      </span>
    )
  }

  if (rank === 1) {
    return (
      <span className="rounded-full bg-coral px-2.5 py-1 text-xs font-semibold text-white">
        Best overall
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
  const [openOnly, setOpenOnly] = useState(false)
  const [localOnly, setLocalOnly] = useState(false)
  const [hardwareFitOnly, setHardwareFitOnly] = useState(false)
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null)

  const rankBySlug = useMemo(
    () => new Map(models.map((model, index) => [model.slug, index + 1])),
    [models],
  )
  const alternativesBySlug = useMemo(
    () => new Map(featuredAlternatives.map((alternative) => [alternative.slug, alternative])),
    [featuredAlternatives],
  )

  const handleHardwareProfileChange = useCallback((
    profile: HardwareProfile | null,
    source: HardwareProfileChangeSource,
  ) => {
    setHardwareProfile(profile)
    if (!profile) {
      setHardwareFitOnly(false)
      return
    }

    // A fresh device check is a strong signal that the person wants the result
    // interpreted for this machine. Restoring an old browser profile only adds
    // annotations until they explicitly opt back into the device view.
    if (source === 'checked' || source === 'memory') {
      setHardwareFitOnly(true)
      setLocalOnly(false)
      setShowAllModels(false)
    }
  }, [])

  const hardwareFitBySlug = useMemo(() => {
    const fits = new Map<string, ReturnType<typeof assessHardwareFit>>()
    if (!hardwareProfile) return fits
    for (const model of models) {
      if (model.localInfo) {
        fits.set(model.slug, assessHardwareFit(model.localInfo, hardwareProfile))
      }
    }
    return fits
  }, [hardwareProfile, models])

  const deviceFitCount = useMemo(
    () => models.filter((model) => hardwareFitBySlug.get(model.slug)?.fits).length,
    [hardwareFitBySlug, models],
  )

  const filteredModels = useMemo(() => models.filter((model) => {
    if (openOnly && (model.openWeights ?? 0) < OPEN_WEIGHTS_THRESHOLD) return false
    if (localOnly && !model.localCapable) return false
    if (hardwareFitOnly && !hardwareFitBySlug.get(model.slug)?.fits) return false
    return true
  }), [hardwareFitBySlug, hardwareFitOnly, localOnly, models, openOnly])

  const visibleModels = useMemo(() => {
    if (showAllModels) return filteredModels

    // When a filter is active, preserve the original recommendation order and
    // show the first few eligible results. Do not silently recalculate scores.
    if (openOnly || localOnly || hardwareFitOnly) return filteredModels.slice(0, 5)

    const featuredSlugs = [models[0]?.slug, ...featuredAlternatives.map((alternative) => alternative.slug)]
      .filter((slug): slug is string => Boolean(slug))
    const modelBySlug = new Map(filteredModels.map((model) => [model.slug, model]))
    return featuredSlugs
      .map((slug) => modelBySlug.get(slug))
      .filter((model): model is ScoredModel => Boolean(model))
  }, [featuredAlternatives, filteredModels, hardwareFitOnly, localOnly, models, openOnly, showAllModels])

  const hiddenCount = filteredModels.length - visibleModels.length
  const firstVisibleSlug = visibleModels[0]?.slug
  const overallTop = models[0]
  const overallTopHardwareFit = overallTop
    ? hardwareFitBySlug.get(overallTop.slug)
    : undefined

  function handleSelect(modelSlug: string, rank: number) {
    setError(null)
    const choiceContext = buildSelectionChoiceContext({
      openOnly,
      localOnly,
      hardwareFitOnly,
      hardwareProfile,
      hardwareFit: hardwareFitBySlug.get(modelSlug),
    })
    startTransition(async () => {
      const result = await selectModel(taskId, modelSlug, rank, choiceContext)
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

      {!hardwareFitOnly && <DecisionConfidence confidence={decisionConfidence} />}

      <HardwareProfilePanel
        profile={hardwareProfile}
        onProfileChange={handleHardwareProfileChange}
      />

      {hardwareProfile && (
        <div className={`rounded-xl border px-4 py-3 ${
          hardwareFitOnly
            ? 'border-teal/30 bg-teal/5'
            : 'border-cream-dark bg-white'
        }`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <p className="font-display text-sm font-semibold text-navy">
                {hardwareFitOnly ? 'Recommendations for this device' : 'Device fit is available'}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-navy/65">
                {hardwareFitOnly
                  ? overallTop && overallTop.localCapable && overallTopHardwareFit && !overallTopHardwareFit.fits
                    ? `${overallTop.name} remains Bearing's best overall task match, but its smallest reviewed local configuration needs ~${overallTopHardwareFit.minimumRuntimeGb ?? 'more'} GB against this device's ~${overallTopHardwareFit.memoryBudgetGb} GB model budget. Showing the highest-ranked models likely to run here instead.`
                    : `Showing the highest-ranked models likely to run on this device. ${deviceFitCount} ranked model${deviceFitCount === 1 ? '' : 's'} currently fit the conservative estimate.`
                  : `${deviceFitCount} ranked model${deviceFitCount === 1 ? '' : 's'} are likely to run on this device. The overall bearing is still shown until you switch to the device view.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setHardwareFitOnly((value) => !value)
                setShowAllModels(false)
              }}
              className={hardwareFitOnly ? 'btn-secondary text-xs' : 'btn-primary text-xs'}
            >
              {hardwareFitOnly ? 'Show best overall' : 'Show best for this device'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-cream-dark bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-navy/45">Show</span>
          <button
            type="button"
            aria-pressed={openOnly}
            onClick={() => {
              setOpenOnly((value) => !value)
              setShowAllModels(false)
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              openOnly
                ? 'border-teal bg-teal text-cream'
                : 'border-cream-dark text-navy/70 hover:border-teal hover:text-teal'
            }`}
          >
            Open models only
          </button>
          <button
            type="button"
            aria-pressed={localOnly}
            onClick={() => {
              setLocalOnly((value) => !value)
              setShowAllModels(false)
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              localOnly
                ? 'border-amber bg-amber text-white'
                : 'border-cream-dark text-navy/70 hover:border-amber hover:text-navy'
            }`}
          >
            Runs locally
          </button>
          <button
            type="button"
            aria-pressed={hardwareFitOnly}
            disabled={!hardwareProfile}
            onClick={() => {
              setHardwareFitOnly((value) => !value)
              setShowAllModels(false)
            }}
            title={hardwareProfile
              ? 'Show local models whose reviewed memory footprint fits this device estimate'
              : 'Check or choose this device memory first'}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              hardwareFitOnly
                ? 'border-teal bg-teal text-cream'
                : 'border-cream-dark text-navy/70 hover:border-teal hover:text-teal'
            }`}
          >
            Fits this device
          </button>
          {(openOnly || localOnly || hardwareFitOnly) && (
            <button
              type="button"
              onClick={() => {
                setOpenOnly(false)
                setLocalOnly(false)
                setHardwareFitOnly(false)
                setShowAllModels(false)
              }}
              className="ml-auto text-xs text-navy/50 underline underline-offset-2 hover:text-navy"
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-navy/45">
          Open means strong open-weight evidence. Local requires concrete execution/quantisation evidence. “Fits this device” uses the checked hardware profile plus a conservative runtime-memory allowance. The device view preserves Bearing&apos;s original task ranking among models that fit; it does not pretend the hardware estimate changes model quality.
        </p>
      </div>

      {visibleModels.length === 0 && (
        <div className="rounded-xl border border-cream-dark bg-cream/40 p-5 text-sm text-navy/65">
          No models in this bearing meet the selected filters. Try clearing one filter or adjust the bearing.
        </div>
      )}

      {visibleModels.map((model, index) => {
        const rank = rankBySlug.get(model.slug) ?? index + 1
        const isFirstVisible = model.slug === firstVisibleSlug
        const isTop = hardwareFitOnly ? isFirstVisible : rank === 1
        const alternative = alternativesBySlug.get(model.slug)
        const isSelected = selectedSlug === model.slug
        const isDisabled = selectedSlug !== null && !isSelected
        const evidence = evidenceBySlug[model.slug] ?? UNKNOWN_EVIDENCE
        const benchmark = benchmarkBySlug[model.slug]
        const outcomes = outcomeBySlug[model.slug]
        const hardwareFit = hardwareFitBySlug.get(model.slug)

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
                  <RecommendationLabel
                    rank={rank}
                    alternative={alternative}
                    deviceView={hardwareFitOnly}
                    isFirstVisible={isFirstVisible}
                  />
                  <span className="text-xs text-navy/40">{model.provider}</span>
                  {(model.openWeights ?? 0) >= OPEN_WEIGHTS_THRESHOLD && (
                    <span className="rounded-full border border-teal/30 bg-teal/5 px-2 py-0.5 text-[11px] font-medium text-teal">
                      Open weights
                    </span>
                  )}
                  {!hardwareProfile && model.localCapable && (
                    <span
                      title={model.localEvidenceCheckedAt
                        ? `Reviewed local execution evidence · checked ${model.localEvidenceCheckedAt}`
                        : 'Local execution metadata is available'}
                      className="rounded-full border border-amber/30 bg-amber/5 px-2 py-0.5 text-[11px] font-medium text-navy/65"
                    >
                      {model.localEvidenceStatus === 'confirmed_local' ? 'Reviewed local' : 'Local-capable'}
                    </span>
                  )}
                  {hardwareProfile && model.localCapable && hardwareFit?.fits && hardwareFit.bestQuant && (
                    <span
                      title={`Estimated runtime ~${hardwareFit.estimatedRuntimeGb} GB against a ${hardwareFit.memoryBudgetGb} GB conservative device budget · ${hardwareFit.confidence} confidence`}
                      className="rounded-full border border-teal/30 bg-teal/5 px-2 py-0.5 text-[11px] font-medium text-teal"
                    >
                      Runs on this device · {hardwareFit.bestQuant.quant}
                    </span>
                  )}
                  {hardwareProfile && model.localCapable && hardwareFit && !hardwareFit.fits && (
                    <span
                      title={`Smallest reviewed local configuration needs ~${hardwareFit.minimumRuntimeGb ?? 'more'} GB; Bearing's conservative budget for this device is ${hardwareFit.memoryBudgetGb} GB`}
                      className="rounded-full border border-coral/20 bg-coral/5 px-2 py-0.5 text-[11px] font-medium text-coral"
                    >
                      Local, not on this device
                    </span>
                  )}
                  {!model.localCapable && model.localEvidenceStatus === 'hosted_only' && (
                    <span className="rounded-full border border-navy/15 bg-cream px-2 py-0.5 text-[11px] font-medium text-navy/55">
                      {model.weightAccess === 'provider_only' ? 'Hosted provider model' : 'Hosted open model'}
                    </span>
                  )}
                  {!model.localCapable && model.localEvidenceStatus === 'weights_available' && (
                    <span className="rounded-full border border-navy/15 bg-cream px-2 py-0.5 text-[11px] font-medium text-navy/55">
                      Open weights available
                    </span>
                  )}
                </div>
                <h3 className="font-display text-xl font-bold text-navy">
                  {model.name}
                </h3>
              </div>
              <span className="font-mono text-sm text-navy/35">
                {hardwareFitOnly ? `#${rank} overall` : `#${rank}`}
              </span>
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
              <RunSurface
                taskId={taskId}
                modelSlug={model.slug}
                modelName={model.name}
                ollamaModelId={
                  getModel(model.slug)?.model_class !== 'embedding'
                    ? getReviewedOpenLocalEvidence(model.slug)?.ollamaModelId
                    : undefined
                }
                hardwareProfile={hardwareProfile}
              />
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
            Show all matching models ({filteredModels.length})
          </button>
        </div>
      )}

      {showAllModels && filteredModels.length > 3 && (
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
        <LocalSection
          local={local}
          taskId={taskId}
          hardwareProfile={hardwareProfile}
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
