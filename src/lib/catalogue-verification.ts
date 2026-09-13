import {
  convertPricing,
  inferCapabilities,
  type OpenRouterModel,
} from './openrouter'
import type {
  ModelForVerification,
  VerificationObservation,
} from '@/db/model-verification'

const OPENROUTER_OBSERVABLE_CAPABILITIES = new Set([
  'vision',
  'audio',
  'video',
  'tools',
  'structured_output',
  'extended_thinking',
  'long_context',
])

export interface CatalogueVerificationReport {
  checked: number
  current: number
  attention: number
  unavailable: number
  unmapped: number
  newCandidates: number
  observations: VerificationObservation[]
}

function money(value: number): string {
  if (value === 0) return '$0'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function pricingChanged(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.0001
}

function observedCapabilities(capabilities: string[]): string[] {
  return capabilities
    .filter((capability) => OPENROUTER_OBSERVABLE_CAPABILITIES.has(capability))
    .sort()
}

function capabilityDrift(existing: string[], observed: string[]): string | null {
  const before = observedCapabilities(existing)
  const after = observedCapabilities(observed)
  if (before.join('|') === after.join('|')) return null

  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  const added = after.filter((capability) => !beforeSet.has(capability))
  const removed = before.filter((capability) => !afterSet.has(capability))
  const parts: string[] = []
  if (added.length) parts.push(`capabilities added: ${added.join(', ')}`)
  if (removed.length) parts.push(`capabilities removed: ${removed.join(', ')}`)
  return parts.join('; ')
}

/**
 * Compare Bearing's current catalogue against an OpenRouter snapshot.
 *
 * This is intentionally observational. Availability is safe to record, while
 * metadata differences become `attention` notes for an admin to review rather
 * than silently changing the recommendation model underneath users.
 */
export function assessOpenRouterCatalogue(
  models: ModelForVerification[],
  openRouterModels: OpenRouterModel[],
  verifiedAt = new Date(),
): CatalogueVerificationReport {
  const byId = new Map(openRouterModels.map((model) => [model.id, model]))
  const knownIds = new Set(
    models
      .map((model) => model.openrouterId)
      .filter((id): id is string => Boolean(id)),
  )

  const observations: VerificationObservation[] = []
  let current = 0
  let attention = 0
  let unavailable = 0
  let unmapped = 0

  for (const model of models) {
    if (!model.active) continue
    if (!model.openrouterId) {
      unmapped++
      continue
    }

    const remote = byId.get(model.openrouterId)
    if (!remote) {
      unavailable++
      observations.push({
        slug: model.slug,
        status: 'unavailable',
        source: 'openrouter',
        note: `OpenRouter id ${model.openrouterId} is no longer present in the catalogue.`,
        verifiedAt: verifiedAt.toISOString(),
      })
      continue
    }

    const drift: string[] = []
    const remotePricing = convertPricing(remote.pricing.prompt, remote.pricing.completion)
    if (pricingChanged(model.pricing.input_per_1m, remotePricing.input_per_1m)) {
      drift.push(
        `input price ${money(model.pricing.input_per_1m)} → ${money(remotePricing.input_per_1m)}/M`,
      )
    }
    if (pricingChanged(model.pricing.output_per_1m, remotePricing.output_per_1m)) {
      drift.push(
        `output price ${money(model.pricing.output_per_1m)} → ${money(remotePricing.output_per_1m)}/M`,
      )
    }
    if (model.contextWindow !== remote.context_length) {
      drift.push(
        `context ${model.contextWindow.toLocaleString()} → ${remote.context_length.toLocaleString()} tokens`,
      )
    }

    const inferred = inferCapabilities(
      remote.architecture?.input_modalities ?? ['text'],
      remote.architecture?.output_modalities ?? ['text'],
      remote.supported_parameters ?? [],
      remote.context_length,
    )
    const caps = capabilityDrift(model.capabilities, inferred)
    if (caps) drift.push(caps)

    if (drift.length > 0) {
      attention++
      observations.push({
        slug: model.slug,
        status: 'attention',
        source: 'openrouter',
        note: drift.join('; '),
        verifiedAt: verifiedAt.toISOString(),
      })
    } else {
      current++
      observations.push({
        slug: model.slug,
        status: 'current',
        source: 'openrouter',
        note: null,
        verifiedAt: verifiedAt.toISOString(),
      })
    }
  }

  const newCandidates = openRouterModels.filter((model) => !knownIds.has(model.id)).length

  return {
    checked: observations.length,
    current,
    attention,
    unavailable,
    unmapped,
    newCandidates,
    observations,
  }
}
