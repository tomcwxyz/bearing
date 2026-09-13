import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export interface ModelExternalIds {
  openrouterId: string | null
  providerModelId: string | null
}

export async function getModelExternalIds(slug: string): Promise<ModelExternalIds> {
  const rows = await getDb()`
    SELECT openrouter_id, provider_model_id
    FROM models
    WHERE slug = ${slug}
  `

  if (rows.length === 0) {
    return { openrouterId: null, providerModelId: null }
  }

  return {
    openrouterId: (rows[0].openrouter_id as string | null) ?? null,
    providerModelId: (rows[0].provider_model_id as string | null) ?? null,
  }
}

/**
 * External catalogue identifiers are maintained separately from editorial
 * model metadata. This prevents a normal admin edit from accidentally erasing
 * a mapping simply because that form did not carry the identifier.
 */
export async function saveModelExternalIds(
  slug: string,
  ids: ModelExternalIds,
): Promise<void> {
  await getDb()`
    UPDATE models
    SET
      openrouter_id = ${ids.openrouterId},
      provider_model_id = ${ids.providerModelId},
      updated_at = now()
    WHERE slug = ${slug}
  `
}
