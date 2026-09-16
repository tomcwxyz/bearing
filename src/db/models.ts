import { neon } from '@neondatabase/serverless'
import type { Model } from '@/lib/registry'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export function modelRowToModel(row: Record<string, unknown>): Model {
  return {
    slug: row.slug as string,
    name: row.name as string,
    provider: row.provider as string,
    tier: row.tier as string,
    model_class: (row.model_class as Model['model_class']) ?? 'chat',
    pricing: row.pricing as Model['pricing'],
    context_window: row.context_window as number,
    capabilities: row.capabilities as Model['capabilities'],
    strengths: row.strengths as string[],
    weaknesses: row.weaknesses as string[],
    task_fitness: row.task_fitness as Model['task_fitness'],
    speed_score: row.speed_score as number,
    privacy_score: row.privacy_score as number,
    transparency: row.transparency as Model['transparency'],
    sustainability: row.sustainability as Model['sustainability'],
    ...(row.local_info ? { local_info: row.local_info as Model['local_info'] } : {}),
    ...(row.embedding_dim != null ? { embedding_dim: row.embedding_dim as number } : {}),
    ...(row.max_input_tokens != null ? { max_input_tokens: row.max_input_tokens as number } : {}),
    ...(row.supports_matryoshka != null ? { supports_matryoshka: row.supports_matryoshka as boolean } : {}),
  }
}

export async function getAllModelsFromDb(): Promise<Model[]> {
  const rows = await getDb()`SELECT * FROM models WHERE active = true ORDER BY name`
  return rows.map(modelRowToModel)
}

export type AdminModel = Model & { active: boolean }

export async function getAllModelsForAdmin(): Promise<AdminModel[]> {
  const rows = await getDb()`SELECT * FROM models ORDER BY active DESC, name`
  return rows.map((row) => ({ ...modelRowToModel(row), active: row.active as boolean }))
}

export async function getModelFromDb(slug: string): Promise<Model | null> {
  const rows = await getDb()`SELECT * FROM models WHERE slug = ${slug}`
  return rows.length > 0 ? modelRowToModel(rows[0]) : null
}

export async function getModelForAdmin(slug: string): Promise<AdminModel | null> {
  const rows = await getDb()`SELECT * FROM models WHERE slug = ${slug}`
  if (rows.length === 0) return null
  return { ...modelRowToModel(rows[0]), active: rows[0].active as boolean }
}

export async function getOpenRouterId(slug: string): Promise<string | null> {
  const rows = await getDb()`SELECT openrouter_id FROM models WHERE slug = ${slug}`
  return rows.length > 0 ? (rows[0].openrouter_id as string | null) : null
}

export async function getOpenRouterIds(): Promise<Map<string, string>> {
  const rows = await getDb()`SELECT slug, openrouter_id FROM models WHERE openrouter_id IS NOT NULL`
  const map = new Map<string, string>()
  for (const row of rows) map.set(row.openrouter_id as string, row.slug as string)
  return map
}

export async function getOpenRouterIdsBySlug(): Promise<Map<string, string>> {
  const rows = await getDb()`SELECT slug, openrouter_id FROM models WHERE openrouter_id IS NOT NULL`
  const map = new Map<string, string>()
  for (const row of rows) map.set(row.slug as string, row.openrouter_id as string)
  return map
}

export async function upsertModel(model: {
  slug: string
  name: string
  provider: string
  tier: string
  pricing: { input_per_1m: number; output_per_1m: number }
  context_window: number
  capabilities: string[]
  strengths: string[]
  weaknesses: string[]
  task_fitness: Record<string, number>
  speed_score: number
  privacy_score: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transparency: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sustainability: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  local_info?: any
  openrouter_id?: string | null
  active?: boolean
  model_class?: 'chat' | 'embedding'
  embedding_dim?: number | null
  max_input_tokens?: number | null
  supports_matryoshka?: boolean
}): Promise<void> {
  await getDb()`
    INSERT INTO models (
      slug, name, provider, tier, pricing, context_window,
      capabilities, strengths, weaknesses, task_fitness,
      speed_score, privacy_score, transparency, sustainability,
      local_info, openrouter_id, active,
      model_class, embedding_dim, max_input_tokens, supports_matryoshka
    ) VALUES (
      ${model.slug}, ${model.name}, ${model.provider}, ${model.tier},
      ${JSON.stringify(model.pricing)}::jsonb, ${model.context_window},
      ${model.capabilities}::text[], ${model.strengths}::text[], ${model.weaknesses}::text[],
      ${JSON.stringify(model.task_fitness)}::jsonb,
      ${model.speed_score}, ${model.privacy_score},
      ${JSON.stringify(model.transparency)}::jsonb,
      ${JSON.stringify(model.sustainability)}::jsonb,
      ${model.local_info ? JSON.stringify(model.local_info) : null}::jsonb,
      ${model.openrouter_id ?? null},
      ${model.active ?? true},
      ${model.model_class ?? 'chat'},
      ${model.embedding_dim ?? null},
      ${model.max_input_tokens ?? null},
      ${model.supports_matryoshka ?? false}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, provider = EXCLUDED.provider, tier = EXCLUDED.tier,
      pricing = EXCLUDED.pricing, context_window = EXCLUDED.context_window,
      capabilities = EXCLUDED.capabilities, strengths = EXCLUDED.strengths,
      weaknesses = EXCLUDED.weaknesses, task_fitness = EXCLUDED.task_fitness,
      speed_score = EXCLUDED.speed_score, privacy_score = EXCLUDED.privacy_score,
      transparency = EXCLUDED.transparency, sustainability = EXCLUDED.sustainability,
      local_info = EXCLUDED.local_info,
      openrouter_id = COALESCE(EXCLUDED.openrouter_id, models.openrouter_id),
      active = EXCLUDED.active,
      model_class = EXCLUDED.model_class,
      embedding_dim = EXCLUDED.embedding_dim,
      max_input_tokens = EXCLUDED.max_input_tokens,
      supports_matryoshka = EXCLUDED.supports_matryoshka,
      updated_at = now()
  `
}

export async function updateModelPricing(
  slug: string,
  pricing: { input_per_1m: number; output_per_1m: number },
): Promise<void> {
  await getDb()`
    UPDATE models SET pricing = ${JSON.stringify(pricing)}::jsonb, updated_at = now()
    WHERE slug = ${slug}
  `
}

export async function deactivateModel(slug: string): Promise<void> {
  await getDb()`UPDATE models SET active = false, updated_at = now() WHERE slug = ${slug}`
}
