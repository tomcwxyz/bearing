// Seed benchmark_aliases for Artificial Analysis → bearing slugs by running
// the Phase 0 matcher over the live AA model list against every active
// registry model. Dry-run by default; pass --apply to commit.
//
//   npx tsx scripts/seed-aa-aliases.ts          # print proposals
//   npx tsx scripts/seed-aa-aliases.ts --apply  # commit via upsertAlias
//
// Many-to-one is intentional: one bearing slug typically maps to several AA
// variants (Reasoning / Non-reasoning / effort-level). The downstream
// getLatestBenchmarkScores() averages across them at read time.

import { config } from 'dotenv'
config({ path: '.env.local' })

import { upsertAlias } from '../src/lib/benchmarks'
import { getAllModelsFromDb } from '../src/lib/db'
import { suggestBenchmarkAliases } from '../src/lib/import-grounding'

const AA_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models'

interface AaModel {
  name: string
  slug: string
}

async function fetchAaModels(): Promise<AaModel[]> {
  const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY
  if (!apiKey) throw new Error('ARTIFICIAL_ANALYSIS_API_KEY not set in .env.local')
  const res = await fetch(AA_URL, { headers: { 'x-api-key': apiKey } })
  if (!res.ok) throw new Error(`AA HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { data: AaModel[] }
  return body.data
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`Mode: ${apply ? 'APPLY (writing to benchmark_aliases)' : 'DRY-RUN'}`)

  const [aaModels, registryModels] = await Promise.all([
    fetchAaModels(),
    getAllModelsFromDb(),
  ])
  const candidates = aaModels.map(m => ({ name: m.name, slug: m.slug }))
  console.log(`AA models: ${aaModels.length}  ·  registry models: ${registryModels.length}\n`)

  let totalAliases = 0
  let modelsWithMatches = 0
  let modelsWithoutMatches = 0

  for (const m of registryModels) {
    const suggestions = suggestBenchmarkAliases(
      { slug: m.slug, name: m.name, provider: m.provider },
      'artificialanalysis',
      candidates,
    )
    if (suggestions.length === 0) {
      modelsWithoutMatches++
      continue
    }
    modelsWithMatches++

    // Seed only the unflagged matches automatically — flagged ones (mini/nano,
    // VL, distill, etc.) need admin judgment so we surface them but skip.
    const clean = suggestions.filter(s => s.flags.length === 0)
    const flagged = suggestions.filter(s => s.flags.length > 0)

    console.log(`\n${m.slug}  (${m.name})`)
    for (const s of clean) {
      console.log(`  + ${s.name}  (score ${s.score.toFixed(2)})`)
      if (apply) await upsertAlias('artificialanalysis', s.name, m.slug, 'auto-seeded by suggestBenchmarkAliases')
      totalAliases++
    }
    for (const s of flagged) {
      console.log(`  ? ${s.name}  (flags: ${s.flags.join(',')})  -- skipped, admin should review`)
    }
  }

  console.log(`\n──────`)
  console.log(`Models with ≥1 clean match: ${modelsWithMatches}`)
  console.log(`Models with no AA match:    ${modelsWithoutMatches}`)
  console.log(`Aliases ${apply ? 'written' : 'proposed'}:        ${totalAliases}`)
  if (!apply) console.log(`\nRe-run with --apply to commit.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
