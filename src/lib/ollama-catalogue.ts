const OLLAMA_CLOUD_BASE = 'https://ollama.com'

export interface OllamaModelDetails {
  parent_model?: string
  format?: string
  family?: string
  families?: string[] | null
  parameter_size?: string
  quantization_level?: string
}

export interface OllamaCatalogueModel {
  name: string
  model: string
  modified_at?: string
  size?: number
  digest?: string
  details?: OllamaModelDetails
}

export interface OllamaCatalogue {
  models: OllamaCatalogueModel[]
}

type LoopbackRequestInit = RequestInit & {
  targetAddressSpace?: 'loopback'
}

export async function fetchOllamaCloudModels(
  options: {
    fetchImpl?: typeof fetch
  } = {},
): Promise<OllamaCatalogueModel[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(`${OLLAMA_CLOUD_BASE}/api/tags`)
  if (!response.ok) {
    throw new Error(`Ollama cloud catalogue failed (${response.status})`)
  }
  const payload = await response.json() as OllamaCatalogue
  return Array.isArray(payload.models) ? payload.models : []
}

/** Same endpoint shape works against a local Ollama daemon. */
export async function fetchLocalOllamaModels(
  baseUrl = 'http://localhost:11434',
  options: {
    fetchImpl?: typeof fetch
  } = {},
): Promise<OllamaCatalogueModel[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const init: LoopbackRequestInit = { targetAddressSpace: 'loopback' }
  const response = await fetchImpl(
    `${baseUrl.replace(/\/$/, '')}/api/tags`,
    init,
  )
  if (!response.ok) {
    throw new Error(`Local Ollama catalogue failed (${response.status})`)
  }
  const payload = await response.json() as OllamaCatalogue
  return Array.isArray(payload.models) ? payload.models : []
}

export function normaliseOllamaModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/:latest$/, '')
    .replace(/[^a-z0-9]+/g, '')
}

function ollamaFamily(name: string): string {
  const leaf = name.trim().toLowerCase().split('/').pop() ?? name.toLowerCase()
  return normaliseOllamaModelName(leaf.split(':')[0] ?? leaf)
}

function ollamaParameterSize(name: string): string | null {
  const leaf = name.trim().toLowerCase().split('/').pop() ?? name.toLowerCase()
  const match = leaf.match(/(?:^|[-_:])(\d+(?:\.\d+)?b)(?=$|[-_:])/i)
  return match?.[1]?.toLowerCase() ?? null
}

/**
 * Ollama tags can name the same model with different instruction/quantisation
 * suffixes. Treat those as compatible only when the model family matches and,
 * when Bearing has reviewed a parameter size, that size also matches.
 */
export function ollamaModelNamesCompatible(expected: string, observed: string): boolean {
  if (normaliseOllamaModelName(expected) === normaliseOllamaModelName(observed)) return true
  if (ollamaFamily(expected) !== ollamaFamily(observed)) return false

  const expectedSize = ollamaParameterSize(expected)
  const observedSize = ollamaParameterSize(observed)
  if (expectedSize) return observedSize === expectedSize

  return true
}

export function findOllamaCatalogueMatch(
  catalogue: OllamaCatalogueModel[],
  candidates: string[],
): OllamaCatalogueModel | null {
  const exact = new Set(candidates.map(normaliseOllamaModelName).filter(Boolean))
  for (const model of catalogue) {
    if (
      exact.has(normaliseOllamaModelName(model.model)) ||
      exact.has(normaliseOllamaModelName(model.name))
    ) {
      return model
    }
  }

  for (const candidate of candidates) {
    const compatible = catalogue.filter((model) =>
      ollamaModelNamesCompatible(candidate, model.model) ||
      ollamaModelNamesCompatible(candidate, model.name),
    )
    if (compatible.length > 0) return compatible[0]
  }

  return null
}
