import type { HardwareProfile, LocalMemoryFit } from './open-local-models'

export interface CoarseHardwareProfile {
  platform: HardwareProfile['platform']
  architecture: HardwareProfile['architecture']
  memory_gb: number
  gpu_vendor?: NonNullable<HardwareProfile['gpu']>['vendor']
  vram_gb?: number
  runtime?: HardwareProfile['runtime']
}

export interface SelectionChoiceContext {
  schema_version: '1'
  filters: {
    open_only: boolean
    local_only: boolean
    hardware_fit_only: boolean
  }
  hardware_profile: CoarseHardwareProfile | null
  predicted_hardware_fit: {
    fits: boolean
    best_quant: string | null
    memory_budget_gb: number
    estimated_runtime_gb: number | null
    headroom_gb: number | null
    confidence: LocalMemoryFit['confidence']
  } | null
}

function finitePositive(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const PLATFORMS = new Set(['macos', 'windows', 'linux', 'unknown'])
const ARCHITECTURES = new Set(['arm64', 'x64', 'unknown'])
const GPU_VENDORS = new Set(['apple', 'nvidia', 'amd', 'intel', 'unknown'])
const RUNTIMES = new Set(['ollama', 'lm-studio', 'llama.cpp', 'mlx', 'transformers'])
const CONFIDENCE = new Set(['high', 'medium', 'low'])

/**
 * Server-safe coercion for the client-provided choice context.
 *
 * Only the explicit coarse schema survives. In particular, GPU model strings,
 * browser UA values and arbitrary extra properties are discarded.
 */
export function sanitiseSelectionChoiceContext(
  value: unknown,
): SelectionChoiceContext | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const rawFilters = raw.filters && typeof raw.filters === 'object'
    ? raw.filters as Record<string, unknown>
    : {}

  let hardwareProfile: CoarseHardwareProfile | null = null
  if (raw.hardware_profile && typeof raw.hardware_profile === 'object') {
    const h = raw.hardware_profile as Record<string, unknown>
    const memory = finitePositive(h.memory_gb)
    const platform = typeof h.platform === 'string' && PLATFORMS.has(h.platform)
      ? h.platform as CoarseHardwareProfile['platform']
      : 'unknown'
    const architecture = typeof h.architecture === 'string' && ARCHITECTURES.has(h.architecture)
      ? h.architecture as CoarseHardwareProfile['architecture']
      : 'unknown'
    if (memory) {
      hardwareProfile = {
        platform,
        architecture,
        memory_gb: Math.min(memory, 2048),
      }
      if (typeof h.gpu_vendor === 'string' && GPU_VENDORS.has(h.gpu_vendor)) {
        hardwareProfile.gpu_vendor = h.gpu_vendor as NonNullable<HardwareProfile['gpu']>['vendor']
      }
      const vram = finitePositive(h.vram_gb)
      if (vram) hardwareProfile.vram_gb = Math.min(vram, 2048)
      if (typeof h.runtime === 'string' && RUNTIMES.has(h.runtime)) {
        hardwareProfile.runtime = h.runtime as HardwareProfile['runtime']
      }
    }
  }

  let predictedFit: SelectionChoiceContext['predicted_hardware_fit'] = null
  if (raw.predicted_hardware_fit && typeof raw.predicted_hardware_fit === 'object') {
    const f = raw.predicted_hardware_fit as Record<string, unknown>
    const budget = finitePositive(f.memory_budget_gb)
    const confidence = typeof f.confidence === 'string' && CONFIDENCE.has(f.confidence)
      ? f.confidence as LocalMemoryFit['confidence']
      : 'low'
    if (budget) {
      predictedFit = {
        fits: Boolean(f.fits),
        best_quant: typeof f.best_quant === 'string' ? f.best_quant.slice(0, 64) : null,
        memory_budget_gb: Math.min(budget, 2048),
        estimated_runtime_gb: finitePositive(f.estimated_runtime_gb) ?? null,
        headroom_gb: finitePositive(f.headroom_gb) ?? (Number(f.headroom_gb) === 0 ? 0 : null),
        confidence,
      }
    }
  }

  return {
    schema_version: '1',
    filters: {
      open_only: Boolean(rawFilters.open_only),
      local_only: Boolean(rawFilters.local_only),
      hardware_fit_only: Boolean(rawFilters.hardware_fit_only),
    },
    hardware_profile: hardwareProfile,
    predicted_hardware_fit: predictedFit,
  }
}

export function buildSelectionChoiceContext(input: {
  openOnly: boolean
  localOnly: boolean
  hardwareFitOnly: boolean
  hardwareProfile: HardwareProfile | null
  hardwareFit: LocalMemoryFit | undefined
}): SelectionChoiceContext {
  const { hardwareProfile, hardwareFit } = input
  return {
    schema_version: '1',
    filters: {
      open_only: input.openOnly,
      local_only: input.localOnly,
      hardware_fit_only: input.hardwareFitOnly,
    },
    hardware_profile: hardwareProfile
      ? {
          platform: hardwareProfile.platform,
          architecture: hardwareProfile.architecture,
          memory_gb: hardwareProfile.memoryGb,
          ...(hardwareProfile.gpu?.vendor ? { gpu_vendor: hardwareProfile.gpu.vendor } : {}),
          ...(hardwareProfile.gpu?.vramGb ? { vram_gb: hardwareProfile.gpu.vramGb } : {}),
          ...(hardwareProfile.runtime ? { runtime: hardwareProfile.runtime } : {}),
        }
      : null,
    predicted_hardware_fit: hardwareFit
      ? {
          fits: hardwareFit.fits,
          best_quant: hardwareFit.bestQuant?.quant ?? null,
          memory_budget_gb: hardwareFit.memoryBudgetGb,
          estimated_runtime_gb: hardwareFit.estimatedRuntimeGb,
          headroom_gb: hardwareFit.headroomGb,
          confidence: hardwareFit.confidence,
        }
      : null,
  }
}
