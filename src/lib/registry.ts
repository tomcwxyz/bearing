import registryData from '@/data/bearing-registry.json'

export type Factor = 'cost' | 'speed' | 'quality' | 'privacy' | 'sustainability' | 'transparency' | 'capability'

// Canonical task types as of v0.8.0. The classifier picks one of these for the
// top-level task and for each pipeline stage. `vision` was removed (it's
// available as a capability, not a task) and `other` was removed (the
// classifier now sets `clarification_needed: true` instead of escape-valving).
export const ALL_TASK_TYPES = [
  'summarise',
  'extract',
  'generate',
  'comms',
  'code',
  'math',
  'reasoning',
  'analyse',
  'research',
  'qa',
  'translate',
  'conversation',
] as const

export type TaskType = typeof ALL_TASK_TYPES[number]

// Human-readable labels for the UI. Keys must match ALL_TASK_TYPES exactly.
export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  summarise: 'summarisation',
  extract: 'extraction',
  generate: 'long-form generation',
  comms: 'business communication',
  code: 'code',
  math: 'mathematics',
  reasoning: 'reasoning',
  analyse: 'analysis',
  research: 'research',
  qa: 'question answering',
  translate: 'translation',
  conversation: 'conversation',
}

export type Capability = 'vision' | 'tools' | 'code' | 'long_context' | 'extended_thinking' | 'structured_output' | 'multilingual' | 'audio' | 'video' | 'computer_use'

export interface ModelPricing {
  input_per_1m: number
  output_per_1m: number
}

export interface ModelTransparency {
  open_weights: number
  open_training_data: number
  open_methodology: number
  licence_openness: number
  provider_disclosure: number
  fmti_company_score: number | null
  transparency_score: number
  notes: string
}

export interface ModelSustainability {
  inference_energy: number | null
  training_footprint: number | null
  provider_infrastructure: number | null
  sustainability_score: number
  notes: string
}

export interface QuantOption {
  quant: string
  vram_gb: number
  quality_penalty: number
}

export interface LocalInfo {
  total_params_b: number
  active_params_b: number | null
  is_moe: boolean
  quant_options: QuantOption[]
}

export interface Model {
  slug: string
  name: string
  provider: string
  tier: string
  pricing: ModelPricing
  context_window: number
  capabilities: Capability[]
  strengths: string[]
  weaknesses: string[]
  task_fitness: Record<string, number>
  speed_score: number
  privacy_score: number
  transparency: ModelTransparency
  sustainability: ModelSustainability
  local_info?: LocalInfo
}

export interface Registry {
  meta: {
    name: string
    version: string
    updated: string
    maintainer: string
    license: string
    notes: string
  }
  scoring_methodology: {
    factors: Record<string, string>
    default_weights: Record<Factor, number>
  }
  models: Record<string, Model>
}

export function getRegistry(): Registry {
  const data = registryData as any
  const models: Record<string, Model> = {}
  for (const [slug, model] of Object.entries(data.models)) {
    models[slug] = { slug, ...(model as any) }
  }
  return { ...data, models }
}

export function getModel(slug: string): Model | undefined {
  const registry = getRegistry()
  return registry.models[slug]
}

export function getAllModels(): Model[] {
  const registry = getRegistry()
  return Object.entries(registry.models).map(([slug, model]) => ({
    ...model,
    slug,
  }))
}

export function getModelSlugs(): string[] {
  return Object.keys(registryData.models)
}

export function getDefaultWeights(): Record<Factor, number> {
  return registryData.scoring_methodology.default_weights as Record<Factor, number>
}

/** Try DB first, fall back to static JSON if DB unavailable. */
export async function getAllModelsLive(): Promise<Model[]> {
  try {
    const { getAllModelsFromDb } = await import('./db')
    return await getAllModelsFromDb()
  } catch {
    // DB unavailable (local dev, build time) — use static JSON
    return getAllModels()
  }
}

/** Detail-page lookup: DB first (so freshly imported active models resolve),
 *  fall back to static JSON. */
export async function getModelLive(slug: string): Promise<Model | undefined> {
  try {
    const { getModelForAdmin } = await import('./db')
    const fromDb = await getModelForAdmin(slug)
    // Drafts (active = false) shouldn't be publicly viewable.
    if (fromDb?.active) {
      // Strip the active flag — public Model type doesn't carry it.
      const { active: _active, ...model } = fromDb
      return model
    }
  } catch {
    // DB unavailable — fall through to static JSON
  }
  return getModel(slug)
}
