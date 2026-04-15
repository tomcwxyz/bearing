import type { Factor } from './registry'
import { getDefaultWeights } from './registry'

const RANK_WEIGHTS = [0.30, 0.22, 0.16, 0.12, 0.09, 0.07, 0.04]
const RANK_BLEND = 0.7

const COMPLEXITY_BOOST: Record<string, { quality: number; capability: number }> = {
  simple: { quality: 1.0, capability: 1.0 },
  moderate: { quality: 1.2, capability: 1.1 },
  complex: { quality: 1.5, capability: 1.3 },
}

export interface WeightOptions {
  complexity?: string
  excludedFactors?: string[]
}

export function priorityToWeights(
  priorityOrder: Factor[],
  options?: WeightOptions,
): Record<Factor, number> {
  const defaults = getDefaultWeights()
  const complexity = options?.complexity ?? 'simple'
  const boost = COMPLEXITY_BOOST[complexity] ?? COMPLEXITY_BOOST.simple

  const raw: Record<string, number> = {}
  for (let i = 0; i < priorityOrder.length; i++) {
    const factor = priorityOrder[i]
    raw[factor] = RANK_BLEND * RANK_WEIGHTS[i] + (1 - RANK_BLEND) * defaults[factor]
  }

  // Apply complexity boost to quality and capability
  if (raw.quality) raw.quality *= boost.quality
  if (raw.capability) raw.capability *= boost.capability

  // Zero out excluded factors
  const excluded = new Set(options?.excludedFactors ?? [])
  for (const factor of excluded) {
    raw[factor] = 0
  }

  // Normalise so weights sum to 1.0
  const total = Object.values(raw).reduce((a, b) => a + b, 0)
  const weights: Record<string, number> = {}
  for (const [factor, value] of Object.entries(raw)) {
    weights[factor] = total > 0 ? value / total : 0
  }

  return weights as Record<Factor, number>
}
