// One-shot: backfill models.local_info from bearing-registry.json.
// Re-runnable; only updates rows where local_info IS NULL (so DB stays the
// source of truth once populated).
//
//   npx tsx scripts/backfill-local-info.ts          # dry-run
//   npx tsx scripts/backfill-local-info.ts --apply  # commits

import { config } from 'dotenv'
config({ path: '.env.local' })
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { join } from 'path'

interface RegistryShape {
  models: Record<string, { local_info?: unknown }>
}

async function main() {
  const apply = process.argv.includes('--apply')
  const sql = neon(process.env.NEON_DATABASE_URL!)

  const registryPath = join(__dirname, '..', 'src', 'data', 'bearing-registry.json')
  const registry = JSON.parse(readFileSync(registryPath, 'utf-8')) as RegistryShape

  const candidates: { slug: string; local_info: unknown }[] = []
  for (const [slug, model] of Object.entries(registry.models)) {
    if (model.local_info) candidates.push({ slug, local_info: model.local_info })
  }
  console.log(`Found ${candidates.length} models with local_info in JSON.`)

  // Find which DB rows are NULL for these slugs.
  const slugList = candidates.map(c => c.slug)
  const existing = await sql`
    SELECT slug, local_info IS NOT NULL AS has_local_info
    FROM models
    WHERE slug = ANY(${slugList})
  `
  const haveIt = new Set(existing.filter(r => r.has_local_info).map(r => r.slug as string))
  const knownSlugs = new Set(existing.map(r => r.slug as string))

  const toUpdate = candidates.filter(c => knownSlugs.has(c.slug) && !haveIt.has(c.slug))
  const skippedExisting = candidates.filter(c => haveIt.has(c.slug))
  const missingFromDb = candidates.filter(c => !knownSlugs.has(c.slug))

  console.log(`  ${toUpdate.length} to backfill`)
  console.log(`  ${skippedExisting.length} already populated (skipped)`)
  if (missingFromDb.length > 0) {
    console.log(`  ${missingFromDb.length} not in DB:`, missingFromDb.map(c => c.slug).join(', '))
  }

  for (const { slug, local_info } of toUpdate) {
    console.log(`  ${apply ? 'APPLY' : 'DRY  '}  ${slug}`)
    if (apply) {
      await sql`UPDATE models SET local_info = ${JSON.stringify(local_info)}::jsonb WHERE slug = ${slug}`
    }
  }

  console.log(`\n${apply ? 'Wrote' : 'Would write'} ${toUpdate.length} rows.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
