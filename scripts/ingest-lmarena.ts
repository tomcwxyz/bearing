// CLI wrapper around the LMArena ingest core (src/lib/ingest/lmarena.ts).
//
// Source: https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset (CC-BY-4.0)
//
// Usage: npx tsx scripts/ingest-lmarena.ts

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { ingestLmArena } from '../src/lib/ingest/lmarena'

async function main() {
  const { fetched, inserted, unmatched } = await ingestLmArena({ log: console.log })
  console.log(`\nUpserted ${inserted} of ${fetched} snapshot rows.`)
  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} models have no benchmark_aliases entry yet:`)
    for (const u of unmatched.sort()) console.log(`  - ${u}`)
    console.log('\nAdd mappings via the admin Benchmarks tab or directly to benchmark_aliases.')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
