import type { Factor } from './registry'
import { getDefaultWeights } from './registry'

const RANK_WEIGHTS = [0.30, 0.22, 0.16, 0.12, 0.09, 0.07, 0.04]
const RANK_BLEND = 0.7

export function priorityToWeights(priorityOrder: Factor[]): Record<Factor, number> {
  const defaults = getDefaultWeights()

  const raw: Record<string, number> = {}
  for (let i = 0; i < priorityOrder.length; i++) {
    const factor = priorityOrder[i]
    raw[factor] = RANK_BLEND * RANK_WEIGHTS[i] + (1 - RANK_BLEND) * defaults[factor]
  }

  const total = Object.values(raw).reduce((a, b) => a + b, 0)
  const weights: Record<string, number> = {}
  for (const [factor, value] of Object.entries(raw)) {
    weights[factor] = value / total
  }

  return weights as Record<Factor, number>
}
