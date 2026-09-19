const HF_BASE = 'https://huggingface.co'
const HF_ROUTER_MODELS = 'https://router.huggingface.co/v1/models'

export interface HuggingFaceProviderMapping {
  status?: 'live' | 'staging' | string
  providerId?: string
  provider_id?: string
  task?: string
}

export interface HuggingFaceModelInfo {
  id: string
  sha?: string
  lastModified?: string
  gated?: boolean | 'auto' | 'manual'
  cardData?: {
    license?: string | string[]
    licence?: string | string[]
    [key: string]: unknown
  }
  gguf?: {
    total?: number
    architecture?: string
    [key: string]: unknown
  }
  safetensors?: {
    total?: number
    parameters?: Record<string, number>
    [key: string]: unknown
  }
  inference?: 'warm' | string
  inferenceProviderMapping?: Record<string, HuggingFaceProviderMapping>
}

export interface HuggingFaceRouterProvider {
  provider: string
  status?: string
  context_length?: number
  pricing?: {
    input?: number
    output?: number
  }
  supports_tools?: boolean
  supports_structured_output?: boolean
  first_token_latency_ms?: number
  throughput?: number
  is_model_author?: boolean
}

export interface HuggingFaceRouterModel {
  id: string
  object?: string
  owned_by?: string
  architecture?: {
    input_modalities?: string[]
    output_modalities?: string[]
  }
  providers?: HuggingFaceRouterProvider[]
}

export interface HuggingFaceOpenEvidence {
  modelId: string
  revision?: string
  lastModified?: string
  licenceIds: string[]
  gated: boolean
  hasGgufMetadata: boolean
  hasSafetensorsMetadata: boolean
  parameterCount?: number
  inferenceStatus?: string
  liveProviders: string[]
}

/**
 * Fetch the metadata Bearing cares about without downloading model weights.
 * Public models do not require a token; a token can be supplied for gated or
 * higher-rate access.
 */
export async function fetchHuggingFaceModelInfo(
  modelId: string,
  options: {
    token?: string
    fetchImpl?: typeof fetch
  } = {},
): Promise<HuggingFaceModelInfo> {
  const fetchImpl = options.fetchImpl ?? fetch
  const encodedId = modelId.split('/').map(encodeURIComponent).join('/')
  const query = new URLSearchParams()
  for (const field of [
    'sha',
    'lastModified',
    'cardData',
    'gguf',
    'safetensors',
    'inference',
    'inferenceProviderMapping',
  ]) {
    query.append('expand', field)
  }

  const response = await fetchImpl(`${HF_BASE}/api/models/${encodedId}?${query.toString()}`, {
    headers: options.token
      ? { Authorization: `Bearer ${options.token}` }
      : undefined,
  })
  if (!response.ok) {
    throw new Error(`Hugging Face model lookup failed (${response.status}) for ${modelId}`)
  }
  return response.json() as Promise<HuggingFaceModelInfo>
}

/**
 * Hugging Face's OpenAI-compatible router catalogue includes current provider
 * status plus optional latency/throughput and tool/structured-output support.
 * Keeping this separate from model-card evidence prevents hosted availability
 * from being mistaken for an intrinsic model capability.
 */
export async function fetchHuggingFaceRouterModels(
  options: {
    token?: string
    fetchImpl?: typeof fetch
  } = {},
): Promise<HuggingFaceRouterModel[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(HF_ROUTER_MODELS, {
    headers: options.token
      ? { Authorization: `Bearer ${options.token}` }
      : undefined,
  })
  if (!response.ok) {
    throw new Error(`Hugging Face router catalogue failed (${response.status})`)
  }
  const payload = await response.json() as { data?: HuggingFaceRouterModel[] }
  return Array.isArray(payload.data) ? payload.data : []
}

function parameterCountFromSafetensors(
  safetensors: HuggingFaceModelInfo['safetensors'],
): number | undefined {
  if (!safetensors) return undefined
  if (typeof safetensors.total === 'number') return safetensors.total
  if (!safetensors.parameters) return undefined
  const values = Object.values(safetensors.parameters).filter(Number.isFinite)
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0)
}

function asLicenceIds(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  return []
}

export function deriveHuggingFaceOpenEvidence(
  info: HuggingFaceModelInfo,
): HuggingFaceOpenEvidence {
  const licenceValue = info.cardData?.license ?? info.cardData?.licence
  const liveProviders = Object.entries(info.inferenceProviderMapping ?? {})
    .filter(([, mapping]) => mapping.status === 'live')
    .map(([provider]) => provider)
    .sort()

  return {
    modelId: info.id,
    revision: info.sha,
    lastModified: info.lastModified,
    licenceIds: asLicenceIds(licenceValue),
    gated: info.gated === true || info.gated === 'auto' || info.gated === 'manual',
    hasGgufMetadata: Boolean(info.gguf),
    hasSafetensorsMetadata: Boolean(info.safetensors),
    parameterCount: parameterCountFromSafetensors(info.safetensors),
    inferenceStatus: info.inference,
    liveProviders,
  }
}
