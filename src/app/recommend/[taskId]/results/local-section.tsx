'use client'

import type {
  LocalInferenceResult,
  LocalModelRecommendation,
  HardwareTier,
} from '@/lib/local-inference'
import {
  assessHardwareFit,
  describeLocalTaskFit,
  estimateSafeModelBudgetGb,
  type HardwareProfile,
  type LocalMemoryFit,
} from '@/lib/open-local-models'
import { getReviewedOpenLocalEvidence } from '@/lib/open-local-evidence'
import { LocalOllamaVerifier } from './local-ollama-verifier'

interface LocalSectionProps {
  local: LocalInferenceResult
  taskId: string
  hardwareProfile: HardwareProfile | null
}

function formatParams(rec: LocalModelRecommendation): string {
  const { localInfo } = rec
  const total = `${localInfo.total_params_b}B`
  if (localInfo.is_moe && localInfo.active_params_b) {
    return `${total} MoE, ${localInfo.active_params_b}B active`
  }
  return `${total} params`
}

function LocalRecommendationRow({
  rec,
  taskId,
  hardwareProfile,
  hardwareFit,
}: {
  rec: LocalModelRecommendation
  taskId: string
  hardwareProfile: HardwareProfile | null
  hardwareFit?: LocalMemoryFit
}) {
  const fitLabel = describeLocalTaskFit(rec.effectiveQuality)
  const reviewed = getReviewedOpenLocalEvidence(rec.model.slug)
  const ollamaModelId = rec.modelClass !== 'embedding'
    ? reviewed?.ollamaModelId
    : undefined

  const fitSummary = hardwareProfile && hardwareFit
    ? hardwareFit.fits && hardwareFit.bestQuant
      ? {
          primary: `${hardwareFit.bestQuant.quant} · ~${hardwareFit.estimatedRuntimeGb} GB runtime`,
          secondary: 'Fits this device',
          tone: 'text-teal',
        }
      : {
          primary: hardwareFit.minimumQuant
            ? `${hardwareFit.minimumQuant.quant} · needs ~${hardwareFit.minimumRuntimeGb} GB`
            : 'No viable reviewed quant',
          secondary: 'Needs more memory',
          tone: 'text-coral',
        }
    : {
        primary: `${rec.bestQuant.quant} · ~${rec.bestQuant.vram_gb} GB model`,
        secondary: fitLabel,
        tone: 'text-navy',
      }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-navy">
            {rec.model.name}
            <span className="ml-1 text-xs font-normal text-navy/40">
              {formatParams(rec)}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-navy/50">
            {rec.model.strengths[0]}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-xs text-navy/50">
            {fitSummary.primary}
          </p>
          <p className={`text-xs font-semibold ${fitSummary.tone}`}>
            {fitSummary.secondary}
          </p>
        </div>
      </div>

      {hardwareFit?.fits && ollamaModelId && reviewed?.status === 'confirmed_local' && (
        <LocalOllamaVerifier
          taskId={taskId}
          modelSlug={rec.model.slug}
          modelName={rec.model.name}
          ollamaModelId={ollamaModelId}
          hardwareProfile={hardwareProfile}
        />
      )}
    </div>
  )
}

function TierGroup({
  tier,
  recommendations,
  taskId,
}: {
  tier: HardwareTier
  recommendations: LocalModelRecommendation[]
  taskId: string
}) {
  return (
    <div className="rounded-lg border border-cream-dark border-l-4 border-l-amber bg-white p-4">
      <div className="mb-3">
        <p className="font-display text-sm font-semibold text-navy">
          {tier.name}
        </p>
        <p className="text-xs text-navy/40">
          {tier.examples.join(' · ')}
        </p>
      </div>

      <div className="space-y-4">
        {recommendations.map((rec) => (
          <LocalRecommendationRow
            key={rec.model.slug}
            rec={rec}
            taskId={taskId}
            hardwareProfile={null}
          />
        ))}
      </div>
    </div>
  )
}

function DeviceGroup({
  title,
  description,
  recommendations,
  taskId,
  hardwareProfile,
  tone,
}: {
  title: string
  description: string
  recommendations: Array<{
    rec: LocalModelRecommendation
    fit: LocalMemoryFit
  }>
  taskId: string
  hardwareProfile: HardwareProfile
  tone: 'fits' | 'too-large'
}) {
  if (recommendations.length === 0) return null

  return (
    <div className={`rounded-lg border bg-white p-4 ${
      tone === 'fits'
        ? 'border-teal/25 border-l-4 border-l-teal'
        : 'border-coral/20 border-l-4 border-l-coral'
    }`}>
      <div className="mb-3">
        <p className="font-display text-sm font-semibold text-navy">{title}</p>
        <p className="text-xs text-navy/45">{description}</p>
      </div>
      <div className="space-y-4">
        {recommendations.map(({ rec, fit }) => (
          <LocalRecommendationRow
            key={rec.model.slug}
            rec={rec}
            taskId={taskId}
            hardwareProfile={hardwareProfile}
            hardwareFit={fit}
          />
        ))}
      </div>
    </div>
  )
}

const TOOLS = [
  { name: 'Ollama', url: 'https://ollama.com' },
  { name: 'LM Studio', url: 'https://lmstudio.ai' },
  { name: 'llama.cpp', url: 'https://github.com/ggerganov/llama.cpp' },
]

export function LocalSection({
  local,
  taskId,
  hardwareProfile,
}: LocalSectionProps) {
  const { recommendations, tiersUsed } = local
  if (recommendations.length === 0) return null

  const byTier = new Map<string, LocalModelRecommendation[]>()
  for (const rec of recommendations) {
    const id = rec.hardwareTier.id
    if (!byTier.has(id)) byTier.set(id, [])
    byTier.get(id)!.push(rec)
  }

  const deviceRecommendations = hardwareProfile
    ? recommendations.map((rec) => ({
        rec,
        fit: assessHardwareFit(rec.localInfo, hardwareProfile),
      }))
    : []
  const fitsDevice = deviceRecommendations.filter(({ fit }) => fit.fits)
  const needsMoreMemory = deviceRecommendations.filter(({ fit }) => !fit.fits)
  const modelBudget = hardwareProfile
    ? estimateSafeModelBudgetGb(hardwareProfile)
    : null

  return (
    <div className="mt-8 rounded-xl border-2 border-amber/30 bg-amber/5 p-6">
      <div className="mb-1 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber text-base text-white">
          ⌂
        </span>
        <div>
          <h2 className="font-display text-xl font-bold text-navy">
            {hardwareProfile ? 'Run on this device' : 'Run it locally'}
          </h2>
          <p className="mt-0.5 text-sm leading-relaxed text-navy/60">
            {hardwareProfile
              ? `Bearing is now comparing reviewed local configurations with this device's ~${modelBudget} GB conservative model budget. Models are separated into what should fit here and what needs more memory.`
              : 'These models have concrete local execution metadata. Check this device above to turn these generic hardware tiers into recommendations for the machine you are actually using.'}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {hardwareProfile ? (
          <>
            {fitsDevice.length === 0 && (
              <div className="rounded-lg border border-coral/20 bg-white p-4">
                <p className="font-display text-sm font-semibold text-navy">
                  No reviewed local candidates fit this device yet
                </p>
                <p className="mt-1 text-xs leading-relaxed text-navy/55">
                  Bearing&apos;s current conservative estimate puts every local candidate for this task above this device&apos;s model budget. They may still be usable through a hosted provider.
                </p>
              </div>
            )}
            <DeviceGroup
              title="Can run on this device"
              description="Reviewed configurations that fit Bearing's conservative memory estimate for this machine."
              recommendations={fitsDevice}
              taskId={taskId}
              hardwareProfile={hardwareProfile}
              tone="fits"
            />
            <DeviceGroup
              title="Local models that need more memory"
              description="These can run locally on suitable hardware, but not within this device's current memory estimate."
              recommendations={needsMoreMemory}
              taskId={taskId}
              hardwareProfile={hardwareProfile}
              tone="too-large"
            />
          </>
        ) : (
          tiersUsed.map((tier) => {
            const recs = byTier.get(tier.id)
            if (!recs) return null
            return (
              <TierGroup
                key={tier.id}
                tier={tier}
                recommendations={recs}
                taskId={taskId}
              />
            )
          })
        )}
      </div>

      <div className="mt-4 flex items-center gap-1.5 border-t border-amber/20 pt-3 text-xs text-navy/50">
        <span>Run with:</span>
        {TOOLS.map((tool, i) => (
          <span key={tool.name}>
            {i > 0 && <span className="mr-1.5">·</span>}
            <a
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-navy/70 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-navy hover:decoration-navy/40"
            >
              {tool.name}
            </a>
          </span>
        ))}
      </div>
    </div>
  )
}
