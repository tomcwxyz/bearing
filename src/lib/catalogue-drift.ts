import { listModelsForVerification, type ModelForVerification } from '@/db/model-verification'
import {
  convertPricing,
  fetchOpenRouterModels,
  inferCapabilities,
  type OpenRouterModel,
} from './openrouter'
import {
  fetchProviderCatalogues,
  type ProviderCatalogueModel,
  type ProviderCatalogueSnapshot,
} from './provider-catalogue'

const OPENROUTER_OBSERVABLE_CAPABILITIES = new Set([
  'vision',
  'audio',
  'video',
  'tools',
  'structured_output',
  'extended_thinking',
  'long_context',
])

export type CatalogueDriftField =
  | 'input_price'
  | 'output_price'
  | 'context_window'
  | 'capabilities'

export type CatalogueDriftChange =
  | {
      field: 'input_price' | 'output_price' | 'context_window'
      before: number
      after: number
      source: string
    }
  | {
      field: 'capabilities'
      before: string[]
      after: string[]
      source: string
    }

export interface CatalogueAvailabilityConcern {
  source: string
  message: string
}

export interface CatalogueDriftItem {
  slug: string
  name: string
  provider: string
  changes: CatalogueDriftChange[]
  availabilityConcern: CatalogueAvailabilityConcern | null
}

export interface CatalogueDriftReview {
  items: CatalogueDriftItem[]
  openRouterFailure: string | null
  skippedProviders: { provider: string; reason: string }[]
  providerFailures: { provider: string; error: string }[]
}

export interface CatalogueDriftPatch {
  pricing?: { input_per_1m: number; output_per_1m: number }
  contextWindow?: number
  capabilities?: string[]
}

function normaliseId(id: string): string {
  return id.trim().toLowerCase().replace(/^models\//, '')
}

function changedNumber(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.0001
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const aa = [...a].sort()
  const bb = [...b].sort()
  return aa.every((value, index) => value === bb[index])
}

function mergeOpenRouterCapabilities(current: string[], observed: string[]): string[] {
  const observedSet = new Set(
    observed.filter((capability) => OPENROUTER_OBSERVABLE_CAPABILITIES.has(capability)),
  )

  const next = current.filter(
    (capability) =>
      !OPENROUTER_OBSERVABLE_CAPABILITIES.has(capability) || observedSet.has(capability),
  )

  for (const capability of [...observedSet].sort()) {
    if (!next.includes(capability)) next.push(capability)
  }

  return next
}

function mergeProviderCapabilities(
  current: string[],
  capabilities: ProviderCatalogueModel['capabilities'],
): string[] {
  const next = [...current]

  for (const [capability, supported] of Object.entries(capabilities ?? {})) {
    if (supported == null) continue
    const index = next.indexOf(capability)
    if (supported && index === -1) next.push(capability)
    if (!supported && index !== -1) next.splice(index, 1)
  }

  return next
}

function providerRemoteFor(
  model: ModelForVerification,
  snapshots: ProviderCatalogueSnapshot[],
): { source: string; remote: ProviderCatalogueModel | null } | null {
  if (!model.providerModelId) return null

  const snapshot = snapshots.find(
    (candidate) => candidate.provider.toLowerCase() === model.provider.toLowerCase(),
  )
  if (!snapshot) return null

  const wanted = normaliseId(model.providerModelId)
  const remote = snapshot.models.find((candidate) => normaliseId(candidate.id) === wanted) ?? null
  return { source: snapshot.source, remote }
}

/**
 * Build field-level drift proposals without mutating the registry.
 *
 * Provider-native metadata wins for fields that provider catalogues actually
 * expose. OpenRouter fills the broader pricing/capability gaps. Curated
 * capabilities that neither source can observe are always preserved.
 */
export function buildCatalogueDriftReview(
  models: ModelForVerification[],
  openRouterModels: OpenRouterModel[] | null,
  providerSnapshots: ProviderCatalogueSnapshot[],
): CatalogueDriftItem[] {
  const openRouterById = new Map((openRouterModels ?? []).map((model) => [model.id, model]))
  const items: CatalogueDriftItem[] = []

  for (const model of models) {
    if (!model.active) continue

    const providerMatch = providerRemoteFor(model, providerSnapshots)
    const openRouterRemote = model.openrouterId ? openRouterById.get(model.openrouterId) ?? null : null
    const changes: CatalogueDriftChange[] = []

    let availabilityConcern: CatalogueAvailabilityConcern | null = null
    if (providerMatch && !providerMatch.remote) {
      availabilityConcern = {
        source: providerMatch.source,
        message: `Provider catalogue did not return ${model.providerModelId}. Review availability before changing active state.`,
      }
    } else if (!providerMatch && openRouterModels && model.openrouterId && !openRouterRemote) {
      availabilityConcern = {
        source: 'openrouter',
        message: `OpenRouter no longer returns ${model.openrouterId}. This is evidence for review, not an automatic deactivation.`,
      }
    }

    if (openRouterRemote) {
      const remotePricing = convertPricing(
        openRouterRemote.pricing.prompt,
        openRouterRemote.pricing.completion,
      )

      if (changedNumber(model.pricing.input_per_1m, remotePricing.input_per_1m)) {
        changes.push({
          field: 'input_price',
          before: model.pricing.input_per_1m,
          after: remotePricing.input_per_1m,
          source: 'openrouter',
        })
      }
      if (changedNumber(model.pricing.output_per_1m, remotePricing.output_per_1m)) {
        changes.push({
          field: 'output_price',
          before: model.pricing.output_per_1m,
          after: remotePricing.output_per_1m,
          source: 'openrouter',
        })
      }
    }

    const providerContext = providerMatch?.remote?.contextWindow
    const contextAfter = providerContext != null && providerContext > 0
      ? providerContext
      : openRouterRemote?.context_length
    const contextSource = providerContext != null && providerContext > 0
      ? providerMatch?.source ?? 'provider'
      : 'openrouter'

    if (contextAfter != null && contextAfter > 0 && model.contextWindow !== contextAfter) {
      changes.push({
        field: 'context_window',
        before: model.contextWindow,
        after: contextAfter,
        source: contextSource,
      })
    }

    let capabilitiesAfter = [...model.capabilities]
    let capabilitySource: string | null = null

    if (openRouterRemote) {
      const inferred = inferCapabilities(
        openRouterRemote.architecture?.input_modalities ?? ['text'],
        openRouterRemote.architecture?.output_modalities ?? ['text'],
        openRouterRemote.supported_parameters ?? [],
        openRouterRemote.context_length,
      )
      capabilitiesAfter = mergeOpenRouterCapabilities(capabilitiesAfter, inferred)
      capabilitySource = 'openrouter'
    }

    if (providerMatch?.remote?.capabilities) {
      const hasProviderCapabilityEvidence = Object.values(providerMatch.remote.capabilities)
        .some((supported) => supported != null)
      if (hasProviderCapabilityEvidence) {
        capabilitiesAfter = mergeProviderCapabilities(
          capabilitiesAfter,
          providerMatch.remote.capabilities,
        )
        capabilitySource = providerMatch.source
      }
    }

    if (capabilitySource && !sameStringSet(model.capabilities, capabilitiesAfter)) {
      changes.push({
        field: 'capabilities',
        before: model.capabilities,
        after: capabilitiesAfter,
        source: capabilitySource,
      })
    }

    if (changes.length > 0 || availabilityConcern) {
      items.push({
        slug: model.slug,
        name: model.name,
        provider: model.provider,
        changes,
        availabilityConcern,
      })
    }
  }

  return items
}

export function buildCatalogueDriftPatch(
  model: ModelForVerification,
  item: CatalogueDriftItem,
  acceptedFields: CatalogueDriftField[],
): CatalogueDriftPatch {
  const accepted = new Set(acceptedFields)
  const input = item.changes.find((change) => change.field === 'input_price')
  const output = item.changes.find((change) => change.field === 'output_price')
  const context = item.changes.find((change) => change.field === 'context_window')
  const capabilities = item.changes.find((change) => change.field === 'capabilities')
  const patch: CatalogueDriftPatch = {}

  if (accepted.has('input_price') || accepted.has('output_price')) {
    patch.pricing = {
      input_per_1m:
        accepted.has('input_price') && input && input.field === 'input_price'
          ? input.after
          : model.pricing.input_per_1m,
      output_per_1m:
        accepted.has('output_price') && output && output.field === 'output_price'
          ? output.after
          : model.pricing.output_per_1m,
    }
  }

  if (accepted.has('context_window') && context?.field === 'context_window') {
    patch.contextWindow = context.after
  }

  if (accepted.has('capabilities') && capabilities?.field === 'capabilities') {
    patch.capabilities = capabilities.after
  }

  return patch
}

async function loadCatalogueSources() {
  const [models, providerFetch, openRouterAttempt] = await Promise.all([
    listModelsForVerification(),
    fetchProviderCatalogues(),
    fetchOpenRouterModels()
      .then((models) => ({ models, error: null as string | null }))
      .catch((error: unknown) => ({
        models: null,
        error: error instanceof Error ? error.message : 'OpenRouter catalogue request failed',
      })),
  ])

  return { models, providerFetch, openRouterAttempt }
}

export async function getCatalogueDriftReview(): Promise<CatalogueDriftReview> {
  const { models, providerFetch, openRouterAttempt } = await loadCatalogueSources()
  return {
    items: buildCatalogueDriftReview(models, openRouterAttempt.models, providerFetch.snapshots),
    openRouterFailure: openRouterAttempt.error,
    skippedProviders: providerFetch.skipped,
    providerFailures: providerFetch.failures,
  }
}

/** Re-fetch current source evidence for one model before accepting changes. */
export async function getCurrentCatalogueDriftItem(
  slug: string,
): Promise<{ model: ModelForVerification; item: CatalogueDriftItem } | null> {
  const { models, providerFetch, openRouterAttempt } = await loadCatalogueSources()
  const model = models.find((candidate) => candidate.slug === slug)
  if (!model) return null

  const item = buildCatalogueDriftReview(
    [model],
    openRouterAttempt.models,
    providerFetch.snapshots,
  )[0]
  if (!item) return null

  return { model, item }
}
