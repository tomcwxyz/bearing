import { neon } from '@neondatabase/serverless'
import type { ModelFreshness, VerificationStatus } from '@/lib/model-freshness'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export interface ModelForVerification extends ModelFreshness {
  slug: string
  name: string
  provider: string
  active: boolean
  openrouterId: string | null
  providerModelId: string | null
  pricing: { input_per_1m: number; output_per_1m: number }
  contextWindow: number
  capabilities: string[]
}

export interface ModelVerificationSummary extends ModelFreshness {
  slug: string
  active: boolean
  openrouterId: string | null
  providerModelId: string | null
}

export interface VerificationObservation {
  slug: string
  status: VerificationStatus
  source: string
  note: string | null
  verifiedAt: string
}

function freshnessFromRow(row: Record<string, unknown>): ModelFreshness {
  return {
    last_verified_at: row.last_verified_at ? String(row.last_verified_at) : null,
    verification_status: (row.verification_status as VerificationStatus | null) ?? 'unknown',
    verification_source: (row.verification_source as string | null) ?? null,
    verification_note: (row.verification_note as string | null) ?? null,
  }
}

/**
 * Catalogue-verification view of every model. We include inactive rows so an
 * external id already attached to a draft is not mistaken for a new model,
 * but callers should only verify active rows.
 */
export async function listModelsForVerification(): Promise<ModelForVerification[]> {
  const rows = await getDb()`
    SELECT
      slug, name, provider, active, openrouter_id, provider_model_id,
      pricing, context_window, capabilities, last_verified_at,
      verification_status, verification_source, verification_note
    FROM models
    ORDER BY active DESC, name
  `

  return rows.map((row) => ({
    slug: row.slug as string,
    name: row.name as string,
    provider: row.provider as string,
    active: row.active === true,
    openrouterId: (row.openrouter_id as string | null) ?? null,
    providerModelId: (row.provider_model_id as string | null) ?? null,
    pricing: row.pricing as ModelForVerification['pricing'],
    contextWindow: row.context_window as number,
    capabilities: (row.capabilities as string[]) ?? [],
    ...freshnessFromRow(row),
  }))
}

/** Small serialisable projection used by the admin model list and results. */
export async function getModelVerificationSummaries(): Promise<ModelVerificationSummary[]> {
  const rows = await getDb()`
    SELECT
      slug, active, openrouter_id, provider_model_id, last_verified_at,
      verification_status, verification_source, verification_note
    FROM models
    ORDER BY active DESC, slug
  `

  return rows.map((row) => ({
    slug: row.slug as string,
    active: row.active === true,
    openrouterId: (row.openrouter_id as string | null) ?? null,
    providerModelId: (row.provider_model_id as string | null) ?? null,
    ...freshnessFromRow(row),
  }))
}

/**
 * Persist a verification batch in one query. Verification is observational:
 * this deliberately does not change active state, pricing, capabilities or
 * editorial scores. Material drift is surfaced as `attention` for review.
 */
export async function saveVerificationObservations(
  observations: VerificationObservation[],
): Promise<void> {
  if (observations.length === 0) return

  const payload = JSON.stringify(observations)
  await getDb()`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(
        slug text,
        status text,
        source text,
        note text,
        "verifiedAt" timestamptz
      )
    )
    UPDATE models AS m
    SET
      last_verified_at = incoming."verifiedAt",
      verification_status = incoming.status,
      verification_source = incoming.source,
      verification_note = incoming.note
    FROM incoming
    WHERE m.slug = incoming.slug
  `
}
