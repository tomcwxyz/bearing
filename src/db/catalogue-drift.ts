import { neon } from '@neondatabase/serverless'
import type { CatalogueDriftPatch } from '@/lib/catalogue-drift'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

/**
 * Apply only metadata an admin explicitly accepted from catalogue evidence.
 *
 * Verification is reset to unknown before a fresh check. That avoids showing
 * stale `attention` evidence as if it still described the newly accepted row
 * when an external source happens to fail immediately afterwards.
 */
export async function applyCatalogueDriftPatch(
  slug: string,
  patch: CatalogueDriftPatch,
): Promise<void> {
  const hasPricing = patch.pricing != null
  const hasContext = patch.contextWindow != null
  const hasCapabilities = patch.capabilities != null

  if (!hasPricing && !hasContext && !hasCapabilities) return

  await getDb()`
    UPDATE models
    SET
      pricing = CASE
        WHEN ${hasPricing} THEN ${JSON.stringify(patch.pricing ?? {})}::jsonb
        ELSE pricing
      END,
      context_window = CASE
        WHEN ${hasContext} THEN ${patch.contextWindow ?? 0}
        ELSE context_window
      END,
      capabilities = CASE
        WHEN ${hasCapabilities} THEN ${patch.capabilities ?? []}::text[]
        ELSE capabilities
      END,
      last_verified_at = NULL,
      verification_status = 'unknown',
      verification_source = NULL,
      verification_note = 'Catalogue metadata accepted; awaiting re-verification.',
      updated_at = now()
    WHERE slug = ${slug}
  `
}
