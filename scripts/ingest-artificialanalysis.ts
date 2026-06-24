// CLI wrapper around the Artificial Analysis ingest core
// (src/lib/ingest/artificialanalysis.ts).
//
// Source: https://artificialanalysis.ai/api-reference#models-endpoint
//   header x-api-key: $ARTIFICIAL_ANALYSIS_API_KEY
//
// Usage: npx tsx scripts/ingest-artificialanalysis.ts

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { ingestArtificialAnalysis } from '../src/lib/ingest/artificialanalysis'

async function main() {
  const { fetched, inserted, autoMatched, unmatched } = await ingestArtificialAnalysis({ log: console.log })
  console.log(`\nUpserted ${inserted} of ${fetched} snapshot rows. Auto-matched ${autoMatched.length}.`)
  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} models have no benchmark_aliases entry yet.`)
    console.log('Run scripts/seed-aa-aliases.ts or use the admin Benchmarks tab.')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
