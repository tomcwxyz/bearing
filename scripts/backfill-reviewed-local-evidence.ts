import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'
import { REVIEWED_OPEN_LOCAL_EVIDENCE } from '../src/lib/open-local-evidence'

async function main() {
  const apply = process.argv.includes('--apply')
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is required')

  const sql = neon(url)
  const reviewed = REVIEWED_OPEN_LOCAL_EVIDENCE.filter(
    (entry) => entry.status === 'confirmed_local' && entry.localInfo,
  )

  console.log(`Reviewed local candidates: ${reviewed.length}`)
  let changed = 0

  for (const entry of reviewed) {
    const rows = await sql`
      SELECT slug, local_info
      FROM models
      WHERE slug = ${entry.slug}
    `

    if (rows.length === 0) {
      console.log(`  ? ${entry.slug}: not present in models table`)
      continue
    }

    if (rows[0].local_info) {
      console.log(`  = ${entry.slug}: local_info already present; left unchanged`)
      continue
    }

    const sourceSummary = entry.sources
      .map((source) => `${source.kind} ${source.checkedAt}`)
      .join(', ')
    console.log(`  ${apply ? '+' : 'DRY'} ${entry.slug}: ${sourceSummary}`)

    if (apply) {
      await sql`
        UPDATE models
        SET local_info = ${JSON.stringify(entry.localInfo)}::jsonb,
            updated_at = now()
        WHERE slug = ${entry.slug}
          AND local_info IS NULL
      `
    }
    changed += 1
  }

  console.log(`\n${apply ? 'Updated' : 'Would update'} ${changed} model(s).`)
  console.log('Evidence provenance remains versioned in src/data/open-local-evidence.json.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
