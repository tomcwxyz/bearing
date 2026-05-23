// Seed the 10 embedding models for v0.9.0 + backfill the `embedding`
// task_fitness key onto every existing chat model.
//
// Usage:
//   npx tsx scripts/seed-embedding-models.ts            # dry-run (default)
//   npx tsx scripts/seed-embedding-models.ts --apply    # commit to DB
//
// Source values:
//
// Pricing — from each provider's public pricing page at 2026-05-23.
//   GreenPT pricing converted from €0.20 → $0.22 at 2026-05-23 spot.
//
// Task-fitness embedding scores — hand-curated from MTEB v2 leaderboard
//   averages. These are placeholders; phase 4 (scripts/ingest-mteb.ts)
//   replaces them with benchmark-grounded values via the same provenance
//   flow used for LMArena / LiveBench / AA scores. The relative ordering
//   below should survive phase 4 to a first approximation.
//
// Pricing invariant — every embedding row has output_per_1m === 0.
// Embedding APIs bill input tokens only; this is enforced by the seed
// data and tested in registry.test.ts.

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { neon } from '@neondatabase/serverless'

const apply = process.argv.includes('--apply')

interface EmbeddingSeed {
  slug: string
  name: string
  provider: string
  tier: string
  pricing: { input_per_1m: number; output_per_1m: 0 }
  context_window: number
  capabilities: string[]
  strengths: string[]
  weaknesses: string[]
  embedding_score: number // 0..1 — what we write to task_fitness.embedding
  speed_score: number
  privacy_score: number
  transparency: {
    open_weights: number
    open_training_data: number
    open_methodology: number
    licence_openness: number
    provider_disclosure: number
    fmti_company_score: number | null
    transparency_score: number
    notes: string
  }
  sustainability: {
    inference_energy: number | null
    training_footprint: number | null
    provider_infrastructure: number | null
    sustainability_score: number
    notes: string
  }
  embedding_dim: number
  max_input_tokens: number
  supports_matryoshka: boolean
  local_info?: {
    total_params_b: number
    active_params_b: number | null
    is_moe: boolean
    quant_options: Array<{ quant: string; vram_gb: number; quality_penalty: number }>
  }
}

const NEUTRAL_TRANSPARENCY = {
  open_weights: 0,
  open_training_data: 0.1,
  open_methodology: 0.2,
  licence_openness: 0.1,
  provider_disclosure: 0.4,
  fmti_company_score: null,
  transparency_score: 0.15,
  notes: 'Closed weights; some methodology disclosed.',
}

const OPEN_TRANSPARENCY = {
  open_weights: 1,
  open_training_data: 0.5,
  open_methodology: 0.7,
  licence_openness: 0.9,
  provider_disclosure: 0.7,
  fmti_company_score: null,
  transparency_score: 0.75,
  notes: 'Open weights with permissive licence; methodology partially documented.',
}

const NEUTRAL_SUSTAINABILITY = {
  inference_energy: null,
  training_footprint: null,
  provider_infrastructure: 0.3,
  sustainability_score: 0.3,
  notes: 'No published sustainability data.',
}

const OPEN_LOCAL_SUSTAINABILITY = {
  inference_energy: 0.85,
  training_footprint: null,
  provider_infrastructure: 0.7,
  sustainability_score: 0.78,
  notes: 'Small enough to run on local hardware — user controls the energy source.',
}

const SEEDS: EmbeddingSeed[] = [
  // --- Hosted: flagships ---
  {
    slug: 'openai-embed-3-large',
    name: 'OpenAI text-embedding-3-large',
    provider: 'OpenAI',
    tier: 'flagship',
    pricing: { input_per_1m: 0.13, output_per_1m: 0 },
    context_window: 8192,
    capabilities: [],
    strengths: [
      'Strong general retrieval (MTEB ~64.6)',
      'Matryoshka — dim can be truncated to 256/512/1024/3072',
      'Mature SDK + LangChain / LlamaIndex integration',
    ],
    weaknesses: ['Closed weights', 'English-leaning vs multilingual specialists'],
    embedding_score: 0.75,
    speed_score: 0.95,
    privacy_score: 0.55,
    transparency: NEUTRAL_TRANSPARENCY,
    sustainability: NEUTRAL_SUSTAINABILITY,
    embedding_dim: 3072,
    max_input_tokens: 8192,
    supports_matryoshka: true,
  },
  {
    slug: 'voyage-3-large',
    name: 'Voyage voyage-3-large',
    provider: 'Voyage AI',
    tier: 'flagship',
    pricing: { input_per_1m: 0.18, output_per_1m: 0 },
    context_window: 32000,
    capabilities: ['long_context'],
    strengths: [
      'Top MTEB retrieval at release (>74 average)',
      'Matryoshka — 256/512/1024/2048 dim options',
      'Long 32k input window',
    ],
    weaknesses: ['Closed weights', 'Smaller provider — fewer SDK integrations'],
    embedding_score: 0.85,
    speed_score: 0.92,
    privacy_score: 0.55,
    transparency: NEUTRAL_TRANSPARENCY,
    sustainability: NEUTRAL_SUSTAINABILITY,
    embedding_dim: 1024,
    max_input_tokens: 32000,
    supports_matryoshka: true,
  },
  {
    slug: 'cohere-embed-v4',
    name: 'Cohere embed-v4',
    provider: 'Cohere',
    tier: 'flagship',
    pricing: { input_per_1m: 0.12, output_per_1m: 0 },
    context_window: 128000,
    capabilities: ['long_context', 'multilingual'],
    strengths: [
      'Multilingual leader — strong cross-language retrieval',
      'Very long 128k context',
      'Matryoshka — 256/512/1024/1536 dim options',
      'Enterprise privacy options (BYOK, deployment in customer cloud)',
    ],
    weaknesses: ['Closed weights', 'Slightly behind Voyage on English MTEB'],
    embedding_score: 0.83,
    speed_score: 0.9,
    privacy_score: 0.65,
    transparency: NEUTRAL_TRANSPARENCY,
    sustainability: NEUTRAL_SUSTAINABILITY,
    embedding_dim: 1536,
    max_input_tokens: 128000,
    supports_matryoshka: true,
  },

  // --- Hosted: budget ---
  {
    slug: 'openai-embed-3-small',
    name: 'OpenAI text-embedding-3-small',
    provider: 'OpenAI',
    tier: 'budget',
    pricing: { input_per_1m: 0.02, output_per_1m: 0 },
    context_window: 8192,
    capabilities: [],
    strengths: [
      'Very cheap default — 6.5× cheaper than 3-large',
      'Matryoshka — 512/1024/1536 dim options',
      'Same mature OpenAI tooling',
    ],
    weaknesses: ['Lower MTEB than flagships', 'Closed weights'],
    embedding_score: 0.7,
    speed_score: 0.96,
    privacy_score: 0.55,
    transparency: NEUTRAL_TRANSPARENCY,
    sustainability: NEUTRAL_SUSTAINABILITY,
    embedding_dim: 1536,
    max_input_tokens: 8192,
    supports_matryoshka: true,
  },
  {
    slug: 'voyage-3-lite',
    name: 'Voyage voyage-3-lite',
    provider: 'Voyage AI',
    tier: 'budget',
    pricing: { input_per_1m: 0.02, output_per_1m: 0 },
    context_window: 32000,
    capabilities: ['long_context'],
    strengths: [
      'Very cheap with a 32k input window',
      'Compact 512 dim — index storage savings',
    ],
    weaknesses: ['No Matryoshka', 'Lower retrieval quality than voyage-3-large'],
    embedding_score: 0.68,
    speed_score: 0.96,
    privacy_score: 0.55,
    transparency: NEUTRAL_TRANSPARENCY,
    sustainability: NEUTRAL_SUSTAINABILITY,
    embedding_dim: 512,
    max_input_tokens: 32000,
    supports_matryoshka: false,
  },

  // --- Hosted: balanced ---
  {
    slug: 'mistral-embed-2',
    name: 'Mistral mistral-embed-2',
    provider: 'Mistral',
    tier: 'balanced',
    pricing: { input_per_1m: 0.1, output_per_1m: 0 },
    context_window: 32000,
    capabilities: ['long_context', 'multilingual'],
    strengths: [
      'EU-hosted option (Paris) for GDPR-sensitive workloads',
      'Multilingual support',
      '32k input window',
    ],
    weaknesses: ['No Matryoshka', 'Mid-pack MTEB scores vs flagships'],
    embedding_score: 0.7,
    speed_score: 0.92,
    privacy_score: 0.75,
    transparency: NEUTRAL_TRANSPARENCY,
    sustainability: NEUTRAL_SUSTAINABILITY,
    embedding_dim: 1024,
    max_input_tokens: 32000,
    supports_matryoshka: false,
  },

  // --- Hosted: sustainability-first ---
  {
    slug: 'greenpt-green-embedding',
    name: 'GreenPT green-embedding (Qwen3-Embedding-4B)',
    provider: 'GreenPT',
    tier: 'sustainable_balanced',
    pricing: { input_per_1m: 0.22, output_per_1m: 0 },
    context_window: 32000,
    capabilities: ['long_context', 'multilingual'],
    strengths: [
      '100% renewable energy inference',
      'Heat recovery — server heat heats buildings',
      'EU-hosted GDPR compliant',
      '100+ languages',
      'Matryoshka — 32 to 2560 dim',
      'Qwen3-Embedding-4B backbone (open model under green infrastructure)',
    ],
    weaknesses: [
      'Subscription required for API',
      'Single provider — smaller community than Cohere / OpenAI',
    ],
    embedding_score: 0.8,
    speed_score: 0.88,
    privacy_score: 0.8,
    transparency: {
      open_weights: 1,
      open_training_data: 0.4,
      open_methodology: 0.6,
      licence_openness: 0.8,
      provider_disclosure: 0.85,
      fmti_company_score: null,
      transparency_score: 0.75,
      notes: 'Open-source backbone; hosting infrastructure documented.',
    },
    sustainability: {
      inference_energy: 0.98,
      training_footprint: null,
      provider_infrastructure: 0.95,
      sustainability_score: 0.95,
      notes: '100% renewable energy + heat recovery. Best-in-class for hosted embedding.',
    },
    embedding_dim: 2560,
    max_input_tokens: 32000,
    supports_matryoshka: true,
  },

  // --- Open weights (local-deployable) ---
  {
    slug: 'bge-m3',
    name: 'BAAI BGE-M3',
    provider: 'BAAI',
    tier: 'open_source',
    pricing: { input_per_1m: 0, output_per_1m: 0 },
    context_window: 8192,
    capabilities: ['multilingual'],
    strengths: [
      'Strong multilingual retrieval — 100+ languages',
      'Dense + sparse + multi-vector in one model',
      'MIT licence',
      'Small enough to run on CPU or 2 GB VRAM',
    ],
    weaknesses: ['Self-hosted operational overhead', '8k input limit'],
    embedding_score: 0.77,
    speed_score: 0.85,
    privacy_score: 1.0,
    transparency: OPEN_TRANSPARENCY,
    sustainability: OPEN_LOCAL_SUSTAINABILITY,
    embedding_dim: 1024,
    max_input_tokens: 8192,
    supports_matryoshka: false,
    local_info: {
      total_params_b: 0.6,
      active_params_b: 0.6,
      is_moe: false,
      quant_options: [
        { quant: 'Q8', vram_gb: 2, quality_penalty: 0.0 },
        { quant: 'FP16', vram_gb: 4, quality_penalty: 0.0 },
      ],
    },
  },
  {
    slug: 'nomic-embed-v2-moe',
    name: 'Nomic nomic-embed-text-v2-moe',
    provider: 'Nomic AI',
    tier: 'open_source',
    pricing: { input_per_1m: 0, output_per_1m: 0 },
    context_window: 2048,
    capabilities: [],
    strengths: [
      'Top open English MTEB scores at the 1B-param scale',
      'Matryoshka — 64 to 768 dim',
      'Apache 2.0 licence',
      'Mixture-of-experts — efficient inference',
    ],
    weaknesses: ['2k input limit', 'English-leaning vs BGE-M3'],
    embedding_score: 0.73,
    speed_score: 0.88,
    privacy_score: 1.0,
    transparency: OPEN_TRANSPARENCY,
    sustainability: OPEN_LOCAL_SUSTAINABILITY,
    embedding_dim: 768,
    max_input_tokens: 2048,
    supports_matryoshka: true,
    local_info: {
      total_params_b: 0.6,
      active_params_b: 0.3,
      is_moe: true,
      quant_options: [
        { quant: 'Q8', vram_gb: 4, quality_penalty: 0.0 },
        { quant: 'FP16', vram_gb: 6, quality_penalty: 0.0 },
      ],
    },
  },
  {
    slug: 'gte-qwen2-7b',
    name: 'Alibaba gte-Qwen2-7B-instruct',
    provider: 'Alibaba',
    tier: 'open_source',
    pricing: { input_per_1m: 0, output_per_1m: 0 },
    context_window: 32000,
    capabilities: ['long_context', 'multilingual'],
    strengths: [
      'Top-tier open MTEB performance — competitive with hosted flagships',
      'Long 32k context',
      'Multilingual',
      'Apache 2.0 licence',
    ],
    weaknesses: [
      'Heavy — 7B params, 8 GB VRAM at Q8',
      'Slower than smaller open models',
    ],
    embedding_score: 0.8,
    speed_score: 0.78,
    privacy_score: 1.0,
    transparency: OPEN_TRANSPARENCY,
    sustainability: OPEN_LOCAL_SUSTAINABILITY,
    embedding_dim: 3584,
    max_input_tokens: 32000,
    supports_matryoshka: false,
    local_info: {
      total_params_b: 7.6,
      active_params_b: 7.6,
      is_moe: false,
      quant_options: [
        { quant: 'Q8', vram_gb: 8, quality_penalty: 0.0 },
        { quant: 'FP16', vram_gb: 16, quality_penalty: 0.0 },
      ],
    },
  },
]

async function main() {
  const dbUrl = process.env.NEON_DATABASE_URL
  if (!dbUrl) {
    console.error('NEON_DATABASE_URL not set')
    process.exit(1)
  }
  const sql = neon(dbUrl)

  console.log(`Embedding-model seed plan:\n`)
  for (const m of SEEDS) {
    const dim = m.supports_matryoshka ? `${m.embedding_dim} (Matryoshka)` : `${m.embedding_dim}`
    console.log(
      `  ${m.slug.padEnd(28)} ${m.provider.padEnd(12)} $${m.pricing.input_per_1m}/1M  dim=${dim}  in=${m.max_input_tokens}  emb=${m.embedding_score}`,
    )
  }

  // task_fitness for embedding models: only the embedding key matters at
  // recommendation time (the hard filter blocks chat tasks). We still write
  // zero for every other key so registry-integrity tests can require all 13
  // keys on every active row.
  const allTaskTypes = [
    'summarise', 'extract', 'generate', 'comms', 'code', 'math', 'reasoning',
    'analyse', 'research', 'qa', 'translate', 'conversation', 'embedding',
  ]
  function buildTaskFitness(embeddingScore: number): Record<string, number> {
    const out: Record<string, number> = {}
    for (const t of allTaskTypes) out[t] = 0
    out.embedding = embeddingScore
    return out
  }

  // Step 1 — back-fill the `embedding` key onto every existing chat model.
  const chatModels = (await sql`
    SELECT slug, task_fitness FROM models
    WHERE model_class = 'chat'
  `) as Array<{ slug: string; task_fitness: Record<string, number> }>
  let chatToUpdate = 0
  for (const row of chatModels) {
    if (row.task_fitness?.embedding === undefined) chatToUpdate++
  }
  console.log(`\nChat models needing embedding=0 backfill: ${chatToUpdate}/${chatModels.length}`)

  if (!apply) {
    console.log('\nDry-run — no DB writes. Pass --apply to commit.')
    return
  }

  for (const row of chatModels) {
    if (row.task_fitness?.embedding !== undefined) continue
    const next = { ...row.task_fitness, embedding: 0 }
    await sql`
      UPDATE models
      SET task_fitness = ${JSON.stringify(next)}::jsonb,
          updated_at = now()
      WHERE slug = ${row.slug}
    `
  }
  console.log(`Backfilled ${chatToUpdate} chat models.`)

  // Step 2 — upsert the 10 embedding models.
  for (const m of SEEDS) {
    await sql`
      INSERT INTO models (
        slug, name, provider, tier, pricing, context_window,
        capabilities, strengths, weaknesses, task_fitness,
        speed_score, privacy_score, transparency, sustainability,
        local_info, active,
        model_class, embedding_dim, max_input_tokens, supports_matryoshka
      ) VALUES (
        ${m.slug}, ${m.name}, ${m.provider}, ${m.tier},
        ${JSON.stringify(m.pricing)}::jsonb, ${m.context_window},
        ${m.capabilities}::text[], ${m.strengths}::text[], ${m.weaknesses}::text[],
        ${JSON.stringify(buildTaskFitness(m.embedding_score))}::jsonb,
        ${m.speed_score}, ${m.privacy_score},
        ${JSON.stringify(m.transparency)}::jsonb,
        ${JSON.stringify(m.sustainability)}::jsonb,
        ${m.local_info ? JSON.stringify(m.local_info) : null}::jsonb,
        true,
        'embedding', ${m.embedding_dim}, ${m.max_input_tokens}, ${m.supports_matryoshka}
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, provider = EXCLUDED.provider, tier = EXCLUDED.tier,
        pricing = EXCLUDED.pricing, context_window = EXCLUDED.context_window,
        capabilities = EXCLUDED.capabilities, strengths = EXCLUDED.strengths,
        weaknesses = EXCLUDED.weaknesses, task_fitness = EXCLUDED.task_fitness,
        speed_score = EXCLUDED.speed_score, privacy_score = EXCLUDED.privacy_score,
        transparency = EXCLUDED.transparency, sustainability = EXCLUDED.sustainability,
        local_info = EXCLUDED.local_info, active = EXCLUDED.active,
        model_class = EXCLUDED.model_class,
        embedding_dim = EXCLUDED.embedding_dim,
        max_input_tokens = EXCLUDED.max_input_tokens,
        supports_matryoshka = EXCLUDED.supports_matryoshka,
        updated_at = now()
    `
  }
  console.log(`Upserted ${SEEDS.length} embedding models.`)
  console.log('\nNext: regenerate src/data/bearing-registry.json via `npx tsx scripts/generate-registry.ts`.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
