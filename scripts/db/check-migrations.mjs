#!/usr/bin/env node
/**
 * Checks schema evolution only in a freshly created, disposable PostgreSQL
 * container. No URL or container name is accepted from the caller: this
 * script cannot point at Neon or any user database.
 */
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const directory = join(root, 'src/db/migrations')
const container = 'bearing-migration-test-' + randomBytes(8).toString('hex')
const database = 'bearing_contributor_test'
let started = false

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    timeout: 120000, windowsHide: true, ...options,
  })
  if (result.error || result.status !== 0) {
    const detail = [result.error?.message, result.stdout, result.stderr]
      .filter(Boolean).join('\n')
    throw new Error(program + ' ' + args.slice(0, 2).join(' ') + ' failed: ' + detail.slice(-6000))
  }
  return result.stdout.trim()
}

function sql(source, label) {
  try {
    command('docker', [
      'exec', '-i', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', database,
    ], { input: source })
  } catch (error) {
    throw new Error(label + ': ' + error.message)
  }
}

function cleanup() {
  if (!started) return
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8', timeout: 30000 })
  started = false
}

process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

async function main() {
  const names = readdirSync(directory)
    .filter(name => name.endsWith('.sql') || name.endsWith('.sql.pending'))
  const active = names.filter(name => name.endsWith('.sql')).sort()
  if (active.length === 0) throw new Error('No SQL migrations found.')

  const reserved = new Set()
  for (const name of names) {
    const match = name.match(/^(\d{3})[-_].+\.sql(?:\.pending)?$/)
    if (!match) throw new Error('Unexpected migration filename: ' + name)
    if (reserved.has(match[1])) throw new Error('Duplicate migration number: ' + match[1])
    reserved.add(match[1])
  }

  console.log('Validating ' + active.length + ' SQL migrations on isolated PostgreSQL 16')
  try {
    command('docker', ['info', '--format', '{{.ServerVersion}}'])
  } catch {
    throw new Error('Docker is required. Start Docker Desktop, then retry.')
  }

  command('docker', [
    'run', '--detach', '--rm', '--name', container,
    '--network', 'none', // no exposed ports or external connectivity
    '-e', 'POSTGRES_PASSWORD=local-disposable-test-only',
    '-e', 'POSTGRES_DB=' + database,
    'postgres:16',
  ])
  started = true

  let ready = false
  for (let i = 0; i < 80; i++) {
    const check = spawnSync('docker', [
      'exec', container, 'psql', '-X', '-tA',
      '-U', 'postgres', '-d', database, '-c', 'SELECT 1',
    ], { encoding: 'utf8', timeout: 3000 })
    if (check.status === 0 && check.stdout.trim() === '1') {
      ready = true
      break
    }
    await delay(500)
  }
  if (!ready) throw new Error('Disposable PostgreSQL never became ready')

  sql('CREATE TABLE schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());',
    'migration ledger')

  for (const file of active) {
    sql(readFileSync(join(directory, file), 'utf8'), file)
    sql("INSERT INTO schema_migrations(filename) VALUES ('" + file.replaceAll("'", "''") + "');",
      'migration ledger for ' + file)

    // Exercise 032's historical choice backfill, not just its DDL.
    if (file === '031_user_bearing_preferences.sql') {
      sql(readFileSync(join(root, 'scripts/db/fixtures/pre-v2-choice.sql'), 'utf8'),
        'pre-v2 synthetic records')
    }
    console.log('✓ ' + file)
  }
  sql(readFileSync(join(root, 'scripts/db/assert-schema.sql'), 'utf8'),
    'schema invariants and fixture assertions')
  console.log('✓ Complete: schema, constraints, unresolved benchmark evidence and historical backfill')
}

try {
  await main()
} catch (error) {
  console.error('Migration test failed: ' + error.message)
  process.exitCode = 1
} finally {
  cleanup()
}
