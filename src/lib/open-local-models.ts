import type { LocalInfo, Model, QuantOption } from './registry'
import { getReviewedOpenLocalEvidence } from './open-local-evidence'

/**
 * "Open" is deliberately narrower than Bearing's overall transparency score.
 * A model qualifies for the open-model filter when its weights are strongly
 * open according to the existing editorial rubric. Licence, training-data and
 * methodology openness remain separate evidence and should be shown rather
 * than collapsed into a single "open source" claim.
 */
export const OPEN_WEIGHTS_THRESHOLD = 0.8

export type OpenModelPreference = 'any' | 'prefer_open' | 'open_only'
export type ExecutionPreference = 'anywhere' | 'local_capable' | 'fits_hardware' | 'local_only'

export interface HardwareProfile {
  platform: 'macos' | 'windows' | 'linux' | 'unknown'
  architecture: 'arm64' | 'x64' | 'unknown'
  memoryGb: number
  gpu?: {
    vendor: 'apple' | 'nvidia' | 'amd' | 'intel' | 'unknown'
    model?: string
    vramGb?: number
  }
  runtime?: 'ollama' | 'lm-studio' | 'llama.cpp' | 'mlx' | 'transformers'
}

export interface LocalMemoryFit {
  fits: boolean
  bestQuant: QuantOption | null
  memoryBudgetGb: number
  estimatedRuntimeGb: number | null
  headroomGb: number | null
  confidence: 'high' | 'medium' | 'low'
}

export function estimateQuantRuntimeMemoryGb(quant: QuantOption): number {
  // Model artefact size is not the whole runtime footprint. Keep a small
  // execution/context allowance so "fits" means more than "the file is
  // fractionally smaller than available memory". This is intentionally
  // conservative and still only an estimate until we have runtime telemetry.
  return Math.round((quant.vram_gb * 1.10 + 0.75) * 10) / 10
}

export function estimateSafeModelBudgetGb(profile: HardwareProfile): number {
  const total = profile.gpu?.vramGb ?? profile.memoryGb
  if (!Number.isFinite(total) || total <= 0) return 0

  // Discrete VRAM is a stronger signal than system RAM. Apple unified memory
  // is also directly useful to Metal/Ollama-style local inference. Generic
  // system RAM is useful but weaker because GPU offload/topology is unknown.
  const ratio = profile.gpu?.vramGb
    ? 0.90
    : profile.platform === 'macos' && profile.gpu?.vendor === 'apple'
      ? 0.80
      : 0.70

  return Math.floor(total * ratio * 10) / 10
}

export function hardwareFitConfidence(profile: HardwareProfile): 'high' | 'medium' | 'low' {
  if (profile.gpu?.vramGb) return 'high'
  if (profile.platform === 'macos' && profile.gpu?.vendor === 'apple') return 'medium'
  return 'low'
}

/** True when Bearing has strong evidence that model weights are open. */
export function isOpenWeightModel(
  model: Pick<Model, 'slug' | 'transparency'>,
): boolean {
  const reviewed = getReviewedOpenLocalEvidence(model.slug)
  if (reviewed?.weightAccess === 'provider_only') return false
  return model.transparency.open_weights >= OPEN_WEIGHTS_THRESHOLD
}

/** True when Bearing has enough execution metadata to consider local running. */
export function isLocalCapableModel(
  model: Pick<Model, 'local_info'>,
): boolean {
  return Boolean(model.local_info?.quant_options?.length)
}

/**
 * Assess a model against an explicit memory budget. This deliberately avoids
 * guessing how much RAM/VRAM an arbitrary device can make available: callers
 * can derive or ask for a budget, while this function stays deterministic.
 */
export function assessLocalMemoryFit(
  localInfo: LocalInfo | undefined,
  memoryBudgetGb: number,
  maxQualityPenalty = 0.20,
  confidence: LocalMemoryFit['confidence'] = 'low',
): LocalMemoryFit {
  if (!localInfo || !Number.isFinite(memoryBudgetGb) || memoryBudgetGb <= 0) {
    return {
      fits: false,
      bestQuant: null,
      memoryBudgetGb,
      estimatedRuntimeGb: null,
      headroomGb: null,
      confidence,
    }
  }

  const viable = localInfo.quant_options
    .filter((quant) =>
      quant.quality_penalty <= maxQualityPenalty &&
      estimateQuantRuntimeMemoryGb(quant) <= memoryBudgetGb
    )
    .sort((a, b) => {
      // Prefer the highest-quality viable quant first. If quality is equal,
      // prefer the smaller footprint to leave more context/runtime headroom.
      if (a.quality_penalty !== b.quality_penalty) {
        return a.quality_penalty - b.quality_penalty
      }
      return a.vram_gb - b.vram_gb
    })

  const bestQuant = viable[0] ?? null
  const estimatedRuntimeGb = bestQuant
    ? estimateQuantRuntimeMemoryGb(bestQuant)
    : null

  return {
    fits: Boolean(bestQuant),
    bestQuant,
    memoryBudgetGb,
    estimatedRuntimeGb,
    headroomGb: estimatedRuntimeGb != null
      ? Math.max(0, Math.round((memoryBudgetGb - estimatedRuntimeGb) * 10) / 10)
      : null,
    confidence,
  }
}

export function assessHardwareFit(
  localInfo: LocalInfo | undefined,
  profile: HardwareProfile,
): LocalMemoryFit {
  return assessLocalMemoryFit(
    localInfo,
    estimateSafeModelBudgetGb(profile),
    0.20,
    hardwareFitConfidence(profile),
  )
}

/**
 * Human-facing language for the local task-fit score. This is intentionally
 * qualitative: effectiveQuality is ranking evidence, not a calibrated
 * probability or a "% match".
 */
export function describeLocalTaskFit(effectiveQuality: number): string {
  if (effectiveQuality >= 0.85) return 'Excellent task fit'
  if (effectiveQuality >= 0.72) return 'Strong task fit'
  if (effectiveQuality >= 0.60) return 'Good task fit'
  return 'Possible task fit'
}
