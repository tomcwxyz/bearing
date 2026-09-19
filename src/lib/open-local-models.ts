import type { LocalInfo, Model, QuantOption } from './registry'

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
  platform: 'macos' | 'windows' | 'linux'
  architecture: 'arm64' | 'x64'
  memoryGb: number
  gpu?: {
    vendor: 'apple' | 'nvidia' | 'amd' | 'intel'
    model?: string
    vramGb?: number
  }
  runtime?: 'ollama' | 'lm-studio' | 'llama.cpp' | 'mlx' | 'transformers'
}

export interface LocalMemoryFit {
  fits: boolean
  bestQuant: QuantOption | null
  memoryBudgetGb: number
  headroomGb: number | null
}

/** True when Bearing has strong evidence that model weights are open. */
export function isOpenWeightModel(
  model: Pick<Model, 'transparency'>,
): boolean {
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
): LocalMemoryFit {
  if (!localInfo || !Number.isFinite(memoryBudgetGb) || memoryBudgetGb <= 0) {
    return {
      fits: false,
      bestQuant: null,
      memoryBudgetGb,
      headroomGb: null,
    }
  }

  const viable = localInfo.quant_options
    .filter((quant) =>
      quant.quality_penalty <= maxQualityPenalty &&
      quant.vram_gb <= memoryBudgetGb
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
  return {
    fits: Boolean(bestQuant),
    bestQuant,
    memoryBudgetGb,
    headroomGb: bestQuant
      ? Math.max(0, Math.round((memoryBudgetGb - bestQuant.vram_gb) * 10) / 10)
      : null,
  }
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
