// Queries models table and writes bearing-registry.json.
// Run during build or after admin edits.
// Usage: npx tsx scripts/generate-registry.ts

import { config } from 'dotenv'
config({ path: '.env.local' })
config() // also load .env as fallback
import { neon } from '@neondatabase/serverless'
import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

async function generate() {
  const databaseUrl = process.env.NEON_DATABASE_URL
  if (!databaseUrl) {
    console.log('NEON_DATABASE_URL not set — skipping registry generation, using existing JSON')
    process.exit(0)
  }

  const sql = neon(databaseUrl)

  const rows = await sql`
    SELECT slug, name, provider, tier, pricing, context_window,
           capabilities, strengths, weaknesses, task_fitness,
           speed_score, privacy_score, transparency, sustainability,
           local_info
    FROM models
    WHERE active = true
    ORDER BY slug
  `

  const registryPath = join(__dirname, '..', 'src', 'data', 'bearing-registry.json')
  const existing = JSON.parse(readFileSync(registryPath, 'utf-8'))

  // Build models object keyed by slug
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const models: Record<string, any> = {}
  for (const row of rows) {
    const { slug, ...rest } = row
    models[slug] = {
      name: rest.name,
      provider: rest.provider,
      tier: rest.tier,
      pricing: rest.pricing,
      context_window: rest.context_window,
      capabilities: rest.capabilities,
      strengths: rest.strengths,
      weaknesses: rest.weaknesses,
      task_fitness: rest.task_fitness,
      speed_score: rest.speed_score,
      privacy_score: rest.privacy_score,
      transparency: rest.transparency,
      sustainability: rest.sustainability,
      ...(rest.local_info ? { local_info: rest.local_info } : {}),
    }
  }

  const registry = {
    meta: {
      ...existing.meta,
      updated: new Date().toISOString().split('T')[0],
    },
    scoring_methodology: existing.scoring_methodology,
    transparency_methodology: existing.transparency_methodology,
    sustainability_methodology: existing.sustainability_methodology,
    models,
  }

  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n')
  console.log(`Generated registry with ${Object.keys(models).length} models → ${registryPath}`)
}

generate().catch(err => {
  console.error('Generate failed:', err)
  process.exit(1)
})
