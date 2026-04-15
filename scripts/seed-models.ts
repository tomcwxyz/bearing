// Reads bearing-registry.json and inserts all models into the Neon models table.
// Usage: npx tsx scripts/seed-models.ts

import { config } from 'dotenv'
config({ path: '.env.local' })
config() // also load .env as fallback
import { neon } from '@neondatabase/serverless'
import registryData from '../src/data/bearing-registry.json'

async function seed() {
  const databaseUrl = process.env.NEON_DATABASE_URL
  if (!databaseUrl) {
    console.error('NEON_DATABASE_URL not set')
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  const models = Object.entries(registryData.models)

  console.log(`Seeding ${models.length} models...`)

  for (const [slug, model] of models) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = model as any
    await sql`
      INSERT INTO models (
        slug, name, provider, tier, pricing, context_window,
        capabilities, strengths, weaknesses, task_fitness,
        speed_score, privacy_score, transparency, sustainability,
        local_info
      ) VALUES (
        ${slug}, ${m.name}, ${m.provider}, ${m.tier},
        ${JSON.stringify(m.pricing)}::jsonb, ${m.context_window},
        ${m.capabilities}::text[], ${m.strengths}::text[], ${m.weaknesses}::text[],
        ${JSON.stringify(m.task_fitness)}::jsonb,
        ${m.speed_score}, ${m.privacy_score},
        ${JSON.stringify(m.transparency)}::jsonb,
        ${JSON.stringify(m.sustainability)}::jsonb,
        ${m.local_info ? JSON.stringify(m.local_info) : null}::jsonb
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        provider = EXCLUDED.provider,
        tier = EXCLUDED.tier,
        pricing = EXCLUDED.pricing,
        context_window = EXCLUDED.context_window,
        capabilities = EXCLUDED.capabilities,
        strengths = EXCLUDED.strengths,
        weaknesses = EXCLUDED.weaknesses,
        task_fitness = EXCLUDED.task_fitness,
        speed_score = EXCLUDED.speed_score,
        privacy_score = EXCLUDED.privacy_score,
        transparency = EXCLUDED.transparency,
        sustainability = EXCLUDED.sustainability,
        local_info = EXCLUDED.local_info,
        updated_at = now()
    `
    console.log(`  ✓ ${slug}`)
  }

  console.log(`Done — ${models.length} models seeded.`)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
