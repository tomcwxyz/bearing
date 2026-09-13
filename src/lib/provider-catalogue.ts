import type { ModelForVerification, VerificationObservation } from '@/db/model-verification'

export interface ProviderCatalogueModel {
  id: string
  contextWindow?: number | null
  capabilities?: Partial<Record<'vision' | 'tools' | 'structured_output' | 'extended_thinking', boolean>>
}

export interface ProviderCatalogueSnapshot {
  provider: string
  source: string
  models: ProviderCatalogueModel[]
}

export interface ProviderVerificationReport {
  provider: string
  source: string
  checked: number
  current: number
  attention: number
  unavailable: number
  observations: VerificationObservation[]
}

export interface ProviderFetchSummary {
  snapshots: ProviderCatalogueSnapshot[]
  skipped: { provider: string; reason: string }[]
  failures: { provider: string; error: string }[]
}

type ProviderAdapter = {
  provider: string
  source: string
  envVar: 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY' | 'MISTRAL_API_KEY' | 'GEMINI_API_KEY'
  fetchModels: (apiKey: string) => Promise<ProviderCatalogueModel[]>
}

function normaliseId(id: string): string {
  return id.trim().toLowerCase().replace(/^models\//, '')
}

function diffProviderMetadata(
  local: ModelForVerification,
  remote: ProviderCatalogueModel,
): string[] {
  const drift: string[] = []

  if (
    remote.contextWindow != null &&
    remote.contextWindow > 0 &&
    remote.contextWindow !== local.contextWindow
  ) {
    drift.push(`context ${local.contextWindow.toLocaleString()} → ${remote.contextWindow.toLocaleString()} tokens`)
  }

  for (const [capability, supported] of Object.entries(remote.capabilities ?? {})) {
    if (supported == null) continue
    const localHas = local.capabilities.includes(capability)
    if (localHas !== supported) {
      drift.push(`${capability} ${localHas ? 'present' : 'absent'} → ${supported ? 'supported' : 'not supported'}`)
    }
  }

  return drift
}

/**
 * Compare explicitly mapped Bearing models against a provider-native catalogue.
 * Absence is only evidence when the provider request itself succeeded; fetch
 * failures are handled before this pure function is called.
 */
export function assessProviderCatalogue(
  allModels: ModelForVerification[],
  snapshot: ProviderCatalogueSnapshot,
  now: Date = new Date(),
): ProviderVerificationReport {
  const providerModels = allModels.filter(
    (model) =>
      model.active &&
      model.provider.toLowerCase() === snapshot.provider.toLowerCase() &&
      model.providerModelId,
  )
  const remoteById = new Map(snapshot.models.map((model) => [normaliseId(model.id), model]))
  const verifiedAt = now.toISOString()
  const observations: VerificationObservation[] = []
  let current = 0
  let attention = 0
  let unavailable = 0

  for (const model of providerModels) {
    const providerId = model.providerModelId as string
    const remote = remoteById.get(normaliseId(providerId))

    if (!remote) {
      unavailable++
      observations.push({
        slug: model.slug,
        status: 'unavailable',
        source: snapshot.source,
        note: `Provider catalogue did not return ${providerId}. This is evidence for review, not an automatic deactivation.`,
        verifiedAt,
      })
      continue
    }

    const drift = diffProviderMetadata(model, remote)
    if (drift.length > 0) {
      attention++
      observations.push({
        slug: model.slug,
        status: 'attention',
        source: snapshot.source,
        note: drift.join('; '),
        verifiedAt,
      })
    } else {
      current++
      observations.push({
        slug: model.slug,
        status: 'current',
        source: snapshot.source,
        note: null,
        verifiedAt,
      })
    }
  }

  return {
    provider: snapshot.provider,
    source: snapshot.source,
    checked: providerModels.length,
    current,
    attention,
    unavailable,
    observations,
  }
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body.slice(0, 160)}` : ''}`)
  }

  return response.json()
}

async function fetchAnthropicModels(apiKey: string): Promise<ProviderCatalogueModel[]> {
  const payload = await fetchJson('https://api.anthropic.com/v1/models?limit=1000', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  }) as {
    data?: Array<{
      id?: string
      max_input_tokens?: number | null
      capabilities?: {
        image_input?: { supported?: boolean }
        structured_outputs?: { supported?: boolean }
        thinking?: { supported?: boolean }
      } | null
    }>
  }

  return (payload.data ?? []).flatMap((model) => model.id ? [{
    id: model.id,
    contextWindow: model.max_input_tokens ?? null,
    capabilities: {
      vision: model.capabilities?.image_input?.supported,
      structured_output: model.capabilities?.structured_outputs?.supported,
      extended_thinking: model.capabilities?.thinking?.supported,
    },
  }] : [])
}

async function fetchOpenAIModels(apiKey: string): Promise<ProviderCatalogueModel[]> {
  const payload = await fetchJson('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  }) as { data?: Array<{ id?: string }> }

  return (payload.data ?? []).flatMap((model) => model.id ? [{ id: model.id }] : [])
}

async function fetchMistralModels(apiKey: string): Promise<ProviderCatalogueModel[]> {
  const payload = await fetchJson('https://api.mistral.ai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  }) as {
    data?: Array<{
      id?: string
      max_context_length?: number | null
      capabilities?: {
        vision?: boolean
        function_calling?: boolean
      }
    }>
  } | Array<{
    id?: string
    max_context_length?: number | null
    capabilities?: { vision?: boolean; function_calling?: boolean }
  }>

  const rows = Array.isArray(payload) ? payload : (payload.data ?? [])
  return rows.flatMap((model) => model.id ? [{
    id: model.id,
    contextWindow: model.max_context_length ?? null,
    capabilities: {
      vision: model.capabilities?.vision,
      tools: model.capabilities?.function_calling,
    },
  }] : [])
}

async function fetchGoogleModels(apiKey: string): Promise<ProviderCatalogueModel[]> {
  const results: ProviderCatalogueModel[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({ pageSize: '1000' })
    if (pageToken) params.set('pageToken', pageToken)
    const payload = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?${params}`, {
      headers: { 'x-goog-api-key': apiKey },
    }) as {
      models?: Array<{ name?: string; inputTokenLimit?: number | null }>
      nextPageToken?: string
    }

    for (const model of payload.models ?? []) {
      if (!model.name) continue
      results.push({ id: normaliseId(model.name), contextWindow: model.inputTokenLimit ?? null })
    }
    pageToken = payload.nextPageToken
  } while (pageToken)

  return results
}

const PROVIDER_ADAPTERS: ProviderAdapter[] = [
  { provider: 'Anthropic', source: 'provider:anthropic', envVar: 'ANTHROPIC_API_KEY', fetchModels: fetchAnthropicModels },
  { provider: 'OpenAI', source: 'provider:openai', envVar: 'OPENAI_API_KEY', fetchModels: fetchOpenAIModels },
  { provider: 'Mistral', source: 'provider:mistral', envVar: 'MISTRAL_API_KEY', fetchModels: fetchMistralModels },
  { provider: 'Google', source: 'provider:google', envVar: 'GEMINI_API_KEY', fetchModels: fetchGoogleModels },
]

/** Fetch each configured provider independently. A provider outage never turns
 * its whole model set into false `unavailable` observations. */
export async function fetchProviderCatalogues(): Promise<ProviderFetchSummary> {
  const snapshots: ProviderCatalogueSnapshot[] = []
  const skipped: ProviderFetchSummary['skipped'] = []
  const failures: ProviderFetchSummary['failures'] = []

  await Promise.all(PROVIDER_ADAPTERS.map(async (adapter) => {
    const apiKey = process.env[adapter.envVar]
    if (!apiKey) {
      skipped.push({ provider: adapter.provider, reason: `${adapter.envVar} is not configured` })
      return
    }

    try {
      const models = await adapter.fetchModels(apiKey)
      snapshots.push({ provider: adapter.provider, source: adapter.source, models })
    } catch (error) {
      failures.push({
        provider: adapter.provider,
        error: error instanceof Error ? error.message : 'Provider catalogue request failed',
      })
    }
  }))

  return { snapshots, skipped, failures }
}
