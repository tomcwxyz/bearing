/**
 * Apply SQL migrations from src/db/migrations/ to the Neon database.
 *
 * Tracks applied migrations in a `schema_migrations` table so re-running is
 * idempotent only when the ledger and schema agree. Migrations are applied
 * in lexical filename order (so the NNN- prefix matters). Neon HTTP runs
 * individual statements, NOT a file-level transaction.
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

/**
 * Split a migration file into individual statements. The Neon HTTP driver
 * refuses multi-command queries ("cannot insert multiple commands into a
 * prepared statement"), so we split on top-level semicolons — ignoring those
 * inside dollar-quoted blocks ($$...$$, $tag$...$tag$), single-quoted
 * strings, and comments.
 *
 * A migration file is recorded as applied only after every statement
 * succeeds; since statements don't share a transaction over HTTP, keep
 * individual statements idempotent (IF EXISTS / IF NOT EXISTS) so a
 * partially applied file can simply be re-run.
 */
function splitStatements(ddl: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  let dollarTag: string | null = null

  while (i < ddl.length) {
    const rest = ddl.slice(i)

    if (dollarTag) {
      const end = rest.indexOf(dollarTag)
      const consumed = end === -1 ? rest.length : end + dollarTag.length
      current += rest.slice(0, consumed)
      i += consumed
      dollarTag = null
      continue
    }

    if (rest.startsWith('--')) {
      const nl = rest.indexOf('\n')
      const consumed = nl === -1 ? rest.length : nl + 1
      current += rest.slice(0, consumed)
      i += consumed
      continue
    }

    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/')
      const consumed = end === -1 ? rest.length : end + 2
      current += rest.slice(0, consumed)
      i += consumed
      continue
    }

    if (rest[0] === "'") {
      // single-quoted string; '' is an escaped quote
      const match = rest.match(/^'(?:[^']|'')*'/)
      const consumed = match ? match[0].length : rest.length
      current += rest.slice(0, consumed)
      i += consumed
      continue
    }

    const dollar = rest.match(/^\$[A-Za-z_]*\$/)
    if (dollar) {
      dollarTag = dollar[0]
      current += dollar[0]
      i += dollar[0].length
      continue
    }

    if (rest[0] === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
      i += 1
      continue
    }

    current += rest[0]
    i += 1
  }

  if (current.trim()) statements.push(current.trim())
  return statements
}

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

  // A number of early Neon migrations were applied through the SQL editor rather
  // than this ledger. In particular, production can have 034-036 objects while
  // schema_migrations ends at 024. Do not replay their backfills or DDL just
  // because the ledger is incomplete: a partial replay can corrupt provenance.
  const [schema] = await sql`
    SELECT
      to_regclass('public.benchmark_refresh_runs') IS NOT NULL AS has_034,
      to_regclass('public.model_availability_observations') IS NOT NULL AS has_035,
      (
        to_regclass('public.model_lifecycle_events') IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'models'
            AND column_name = 'retired_at'
        )
      ) AS has_036,
      to_regclass('public.model_evidence_reviews') IS NOT NULL AS has_037
  `
  const untrackedPresent = [
    ['034_benchmark_refresh_runs.sql', schema.has_034],
    ['035_model_availability_history.sql', schema.has_035],
    ['036_model_retirement.sql', schema.has_036],
    ['037_reviewed_model_evidence.sql', schema.has_037],
  ].filter(([filename, present]) => present === true && !applied.has(filename))
    .map(([filename]) => filename as string)

  if (untrackedPresent.length > 0) {
    const message = [
      'Migration ledger/schema mismatch: objects already exist for migrations absent from schema_migrations:',
      ...untrackedPresent.map(filename => `  - ${filename}`),
      'No migrations have been executed. Audit the complete schema and migration history first.',
      'See docs/operations/migration-reconciliation-2026-10-13.md; do not blindly mark migrations applied.',
    ].join('\\n')
    if (!dryRun) throw new Error(message)
    console.warn(`\\nWARNING: ${message}\\n`)
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
    const statements = splitStatements(ddl)
    process.stdout.write(`Applying ${filename} (${statements.length} statement${statements.length === 1 ? '' : 's'})... `)
    try {
      for (const statement of statements) {
        await sql.query(statement)
      }
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
