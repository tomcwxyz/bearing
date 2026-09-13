import type { Capability, Model } from './registry'

export interface CapabilityTaskSignals {
  complexity?: string
  needsVision?: boolean
  needsTools?: boolean
  needsCode?: boolean
  needsReasoning?: boolean
  needsMultilingual?: boolean
  isAgentic?: boolean
}

const OPTIONAL_CAPABILITY_HEADROOM = 0.20
const OPTIONAL_CAPABILITY_BASELINE = 1 - OPTIONAL_CAPABILITY_HEADROOM

/**
 * Score only capabilities that are useful for this task after hard requirements
 * have already been enforced by the scorer.
 *
 * Required capabilities are gates, not bonus points. Optional task signals can
 * add a bounded amount of value, but unrelated capabilities (for example audio
 * on a text-only task) never improve the score.
 */
export function taskRelativeCapabilityScore(
  model: Pick<Model, 'capabilities'>,
  signals: CapabilityTaskSignals,
): number {
  const required = new Set<Capability>()
  if (signals.needsVision) required.add('vision')
  if (signals.needsTools) required.add('tools')
  if (signals.needsCode) required.add('code')

  const useful = new Set<Capability>()
  if (signals.needsReasoning || signals.complexity === 'complex') useful.add('extended_thinking')
  if (signals.needsMultilingual) useful.add('multilingual')
  if (signals.isAgentic) {
    useful.add('tools')
    useful.add('extended_thinking')
    useful.add('structured_output')
  }

  for (const capability of required) useful.delete(capability)

  if (useful.size === 0) return 1

  let supported = 0
  for (const capability of useful) {
    if (model.capabilities.includes(capability)) supported += 1
  }

  return OPTIONAL_CAPABILITY_BASELINE +
    (supported / useful.size) * OPTIONAL_CAPABILITY_HEADROOM
}
