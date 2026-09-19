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
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/tags`)
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

export function findOllamaCatalogueMatch(
  catalogue: OllamaCatalogueModel[],
  candidates: string[],
): OllamaCatalogueModel | null {
  const wanted = new Set(candidates.map(normaliseOllamaModelName).filter(Boolean))
  for (const model of catalogue) {
    if (
      wanted.has(normaliseOllamaModelName(model.model)) ||
      wanted.has(normaliseOllamaModelName(model.name))
    ) {
      return model
    }
  }
  return null
}
