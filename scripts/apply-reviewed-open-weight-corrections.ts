import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'
import { REVIEWED_OPEN_LOCAL_EVIDENCE } from '../src/lib/open-local-evidence'

async function main() {
  const apply = process.argv.includes('--apply')
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is required')

  const sql = neon(url)
  const reviewed = REVIEWED_OPEN_LOCAL_EVIDENCE.filter((entry) => entry.transparencyCorrection)
  console.log(`Reviewed transparency corrections: ${reviewed.length}`)

  let changed = 0
  for (const entry of reviewed) {
    const rows = await sql`SELECT slug, transparency FROM models WHERE slug = ${entry.slug}`
    if (rows.length === 0) {
      console.log(`  ? ${entry.slug}: model not found`)
      continue
    }

    const current = rows[0].transparency as Record<string, unknown>
    const correction = entry.transparencyCorrection!
    const next = {
      ...current,
      open_weights: correction.open_weights,
      licence_openness: correction.licence_openness,
      notes: correction.notes,
    }

    const alreadyApplied =
      current.open_weights === correction.open_weights &&
      current.licence_openness === correction.licence_openness &&
      current.notes === correction.notes

    if (alreadyApplied) {
      console.log(`  = ${entry.slug}: already matches reviewed evidence`)
      continue
    }

    console.log(`  ${apply ? '+' : 'DRY'} ${entry.slug}: open_weights ${current.open_weights} -> ${correction.open_weights}`)
    if (apply) {
      await sql`
        UPDATE models
        SET transparency = ${JSON.stringify(next)}::jsonb, updated_at = now()
        WHERE slug = ${entry.slug}
      `
    }
    changed += 1
  }

  console.log(`\n${apply ? 'Updated' : 'Would update'} ${changed} model(s).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
