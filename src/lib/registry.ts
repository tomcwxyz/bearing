import registryData from '@/data/bearing-registry.json'
import type { ModelClass } from './model-class'

export type Factor = 'cost' | 'speed' | 'quality' | 'privacy' | 'sustainability' | 'transparency' | 'capability'

// Canonical task types as of v0.9.0. The classifier picks one of these for
// the top-level task and for each pipeline stage. `vision` was removed in
// v0.8 (it's a capability, not a task); `other` was removed in v0.8 (the
// classifier now sets `clarification_needed: true` instead of
// escape-valving). v0.9 added `embedding` — see model_class on Model and
// docs/plans/2026-05-23-embedding-models.md.
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
  'embedding',
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
  embedding: 'embedding (vector search / RAG)',
}

// Model classes live in model-class.ts (client-safe, no registry JSON);
// re-exported here so server-side callers keep a single import site.
export { MODEL_CLASSES, isModelClass, type ModelClass } from './model-class'

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

// Provenance for the `inference_energy` sub-score. Lets a consumer of the
// public registry tell whether the value is grounded in real measurement
// (EcoLogits) or a curated editorial estimate — closing the transparency gap
// where a blended number was indistinguishable from a hand-set one.
export interface InferenceEnergyProvenance {
  // 'ecologits' = blended with a real per-request GWP measurement.
  // 'curated'   = editorial estimate against the sustainability rubric anchors.
  source: 'ecologits' | 'curated'
  // The fields below are only present when source === 'ecologits'.
  blend?: number // ECOLOGITS_BLEND weight applied (0..1; 0 = all curated, 1 = all EcoLogits)
  eco_score?: number // absolute GWP-curve efficiency score before blending (1 = most efficient)
  raw_gwp_gco2eq?: number // raw GWP for the canonical 300-output-token request, grams CO2eq
  eco_model?: string // resolved EcoLogits model name the reading came from
  snapshot_date?: string // date of the EcoLogits snapshot used
}

export interface ModelSustainability {
  inference_energy: number | null
  // Provenance for inference_energy. Absent on rows with a null inference_energy.
  inference_energy_source?: InferenceEnergyProvenance
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
  // 'chat' for the generative v0.8 set, 'embedding' for the v0.9 vector
  // models. Defaults to 'chat' on existing rows (migration 021) and on
  // newly imported models — `embedding` is set explicitly when seeding
  // an embedding model. Used as a hard filter in scoring.
  model_class: ModelClass
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
  // Embedding-only fields. Null / undefined on chat models. Pricing
  // invariant: when `model_class === 'embedding'`, `pricing.output_per_1m`
  // is always 0 (embedding APIs bill input tokens only).
  embedding_dim?: number | null
  max_input_tokens?: number | null
  supports_matryoshka?: boolean | null
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
  const data = registryData as unknown as Registry
  const models: Record<string, Model> = {}
  for (const [slug, model] of Object.entries(data.models)) {
    // Default model_class to 'chat' for rows that pre-date v0.9 — the JSON
    // is regenerated from the DB, but the v0.8 dump won't carry the new
    // column until the next `scripts/generate-registry.ts` run. (The type
    // says model_class is always present; the ?? guards the older runtime JSON.)
    models[slug] = {
      ...model,
      slug,
      model_class: model.model_class ?? 'chat',
    }
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
      // eslint ignoreRestSiblings covers the omitted-via-rest `active` binding.
      const { active, ...model } = fromDb
      return model
    }
  } catch {
    // DB unavailable — fall through to static JSON
  }
  return getModel(slug)
}
