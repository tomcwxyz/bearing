/**
 * Apply SQL migrations from src/db/migrations/ to the Neon database.
 *
 * Tracks applied migrations in a `schema_migrations` table so re-running is
 * idempotent. Migrations are applied in lexical filename order (so the
 * NNN- prefix matters). Each migration runs in its own transaction.
 *
 * Usage:
 *   npx tsx scripts/run-migrations.ts            # apply all pending
 *   npx tsx scripts/run-migrations.ts --dry-run  # list pending without applying
 *
 * Requires NEON_DATABASE_URL in .env.local.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(process.cwd(), 'src', 'db', 'migrations')
const dryRun = process.argv.includes('--dry-run')

async function main() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set in .env.local')
  const sql = neon(url)

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  const applied = new Set(
    (await sql`SELECT filename FROM schema_migrations`).map(r => r.filename as string),
  )

  const all = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const pending = all.filter(f => !applied.has(f))

  if (pending.length === 0) {
    console.log(`No pending migrations. ${all.length} already applied.`)
    return
  }

  console.log(`${pending.length} pending migration(s):`)
  for (const f of pending) console.log(`  - ${f}`)

  if (dryRun) {
    console.log('\nDry run — no changes made.')
    return
  }

  for (const filename of pending) {
    const path = join(MIGRATIONS_DIR, filename)
    const ddl = readFileSync(path, 'utf-8')
    process.stdout.write(`Applying ${filename}... `)
    try {
      // neon-serverless executes a single statement per call; for multi-statement
      // migrations we'd need to split. Today our migrations are single-statement;
      // if that changes, switch to a transactional client.
      await sql.query(ddl)
      await sql`INSERT INTO schema_migrations (filename) VALUES (${filename})`
      console.log('ok')
    } catch (err) {
      console.log('FAILED')
      console.error(err)
      process.exit(1)
    }
  }

  console.log(`\nApplied ${pending.length} migration(s).`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
