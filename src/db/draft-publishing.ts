import { neon } from '@neondatabase/serverless'
import type { DraftPublishMeta } from '@/lib/draft-publish'

function db() {
  if (!process.env.NEON_DATABASE_URL) throw new Error('NEON_DATABASE_URL is not set')
  return neon(process.env.NEON_DATABASE_URL)
}

export async function listDraftPublishMeta(): Promise<DraftPublishMeta[]> {
  const rows = await db()`
    SELECT m.slug, m.openrouter_id, m.provider_model_id, m.verification_status,
      COALESCE(array_agg(DISTINCT a.source) FILTER (WHERE a.source IS NOT NULL), '{}') AS benchmark_sources
    FROM models m
    LEFT JOIN benchmark_aliases a ON a.bearing_slug = m.slug
    WHERE m.active = false
    GROUP BY m.slug
    ORDER BY m.name
  `
  return rows.map(r => ({
    slug: String(r.slug),
    openrouterId: r.openrouter_id == null ? null : String(r.openrouter_id),
    providerModelId: r.provider_model_id == null ? null : String(r.provider_model_id),
    verificationStatus: r.verification_status == null ? null : String(r.verification_status),
    benchmarkSources: r.benchmark_sources as string[],
  }))
}

/** Only touches models which are still drafts. Using RETURNING means the UI
 * never claims a publish succeeded if another admin changed its state. */
export async function activateDraftSlugs(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return []
  const rows = await db()`
    UPDATE models SET active = true, updated_at = now()
    WHERE slug = ANY(${slugs}::text[]) AND active = false
    RETURNING slug
  `
  return rows.map(r => String(r.slug))
}
