// Queries models table and writes bearing-registry.json.
// Run during build or after admin edits.
// Usage: npx tsx scripts/generate-registry.ts

import { config } from 'dotenv'
config({ path: '.env.local' })
config() // also load .env as fallback
import { neon } from '@neondatabase/serverless'
import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { computeSustainabilityComposite } from '../src/lib/registry'

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
           local_info,
           model_class, embedding_dim, max_input_tokens, supports_matryoshka
    FROM models
    WHERE active = true
    ORDER BY slug
  `

  // Latest EcoLogits inference_efficiency reading per slug. normalised_score is
  // the absolute GWP-curve score (gwpToScore): 0..1, 1 = most efficient. raw_score
  // is the GWP midpoint in kgCO2eq for the canonical 300-output-token request.
  const ecoRows = await sql`
    SELECT DISTINCT ON (bearing_slug)
      bearing_slug,
      normalised_score,
      raw_score,
      source_model_name,
      snapshot_date::text AS snapshot_date
    FROM benchmark_snapshots
    WHERE source = 'ecologits'
      AND source_category = 'inference_efficiency'
      AND bearing_slug IS NOT NULL
    ORDER BY bearing_slug, snapshot_date DESC, captured_at DESC
  `
  interface EcoReading {
    normalisedScore: number
    rawScore: number | null
    ecoModel: string | null
    snapshotDate: string | null
  }
  const ecoBySlug = new Map<string, EcoReading>()
  for (const r of ecoRows) {
    ecoBySlug.set(r.bearing_slug as string, {
      normalisedScore: r.normalised_score as number,
      rawScore: r.raw_score as number | null,
      ecoModel: r.source_model_name as string | null,
      // Cast to ::text in SQL guarantees a 'YYYY-MM-DD' string; slice defends
      // against any driver that still tacks on a time component.
      snapshotDate: r.snapshot_date ? String(r.snapshot_date).slice(0, 10) : null,
    })
  }

  // Blend ratio: 0 = fully curated, 1 = fully ecologits.
  // When curated inference_energy is null, ecologits is adopted directly
  // regardless of blend ratio.
  const rawBlend = parseFloat(process.env.ECOLOGITS_BLEND ?? '0.5')
  const ECOLOGITS_BLEND = isNaN(rawBlend) ? 0.5 : Math.max(0, Math.min(1, rawBlend))

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
      // v0.9: model_class is always emitted. Defaults to 'chat' for any row
      // somehow missing the column (shouldn't happen post-migration 021).
      model_class: rest.model_class ?? 'chat',
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
      // Embedding-specific fields only emitted on embedding rows.
      ...(rest.embedding_dim != null ? { embedding_dim: rest.embedding_dim } : {}),
      ...(rest.max_input_tokens != null ? { max_input_tokens: rest.max_input_tokens } : {}),
      ...(rest.supports_matryoshka ? { supports_matryoshka: true } : {}),
    }

    // Blend EcoLogits score into inference_energy if available, and stamp
    // provenance so consumers can tell grounded values from curated ones.
    const eco = ecoBySlug.get(slug as string)
    const sustainability = models[slug as string].sustainability
    if (eco !== undefined && ECOLOGITS_BLEND >= 0) {
      if (sustainability) {
        const curated = sustainability.inference_energy as number | null
        // When curated is null the blend is meaningless — adopt EcoLogits fully.
        const effectiveBlend = curated == null ? 1 : ECOLOGITS_BLEND
        const blended = curated == null
          ? eco.normalisedScore
          : curated * (1 - ECOLOGITS_BLEND) + eco.normalisedScore * ECOLOGITS_BLEND

        // Recalculate composite from updated sub-dimensions (nulls excluded),
        // via the shared helper so this and the live import path can't drift.
        const composite = computeSustainabilityComposite(
          {
            inference_energy: blended,
            provider_infrastructure: sustainability.provider_infrastructure,
            training_footprint: sustainability.training_footprint,
          },
          sustainability.sustainability_score,
        )

        models[slug as string].sustainability = {
          ...sustainability,
          inference_energy: Math.round(blended * 100) / 100,
          inference_energy_source: {
            source: 'ecologits',
            blend: effectiveBlend,
            eco_score: Math.round(eco.normalisedScore * 1000) / 1000,
            // raw_score is kgCO2eq; surface as grams for readability.
            ...(eco.rawScore != null ? { raw_gwp_gco2eq: Math.round(eco.rawScore * 1000 * 10000) / 10000 } : {}),
            ...(eco.ecoModel ? { eco_model: eco.ecoModel } : {}),
            ...(eco.snapshotDate ? { snapshot_date: eco.snapshotDate } : {}),
          },
          sustainability_score: composite,
        }
      } else {
        console.warn(`  ⚠ ${slug}: has EcoLogits score but no sustainability object — score dropped`)
      }
    } else if (sustainability && sustainability.inference_energy != null) {
      // Not EcoLogits-covered but has a curated value — mark it explicitly so
      // the provenance is never ambiguous across the registry.
      models[slug as string].sustainability = {
        ...sustainability,
        inference_energy_source: { source: 'curated' },
      }
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

  const ecoCovered = rows.filter((r) => ecoBySlug.has(r.slug as string)).length
  console.log(`EcoLogits coverage: ${ecoCovered}/${rows.length} models`)
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n')
  console.log(`Generated registry with ${Object.keys(models).length} models → ${registryPath}`)
}

generate().catch(err => {
  console.error('Generate failed:', err)
  process.exit(1)
})
