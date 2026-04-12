import registryData from '@/data/bearing-registry.json'

export type Factor = 'cost' | 'speed' | 'quality' | 'privacy' | 'sustainability' | 'transparency' | 'capability'

export type TaskType = 'summarise' | 'generate' | 'extract' | 'code' | 'analyse' | 'translate' | 'conversation' | 'vision' | 'other'

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
