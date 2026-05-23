// One-off migration for the v0.8.0 task-type expansion.
//
// What it does, in order:
//   1. Reads every active model's task_fitness from the DB.
//   2. Writes a timestamped backup JSON under data/backups/ (always, even
//      in dry-run).
//   3. Computes the new task_fitness for each model:
//        - drops `vision`
//        - keeps existing keys (summarise, extract, generate, code,
//          analyse, translate, conversation)
//        - derives five new keys from existing values:
//            math       = mean(code, analyse)
//            reasoning  = analyse
//            comms      = 0.85 * generate
//            research   = 0.70 * analyse
//            qa         = 0.60 * analyse + 0.40 * conversation
//   4. Prints a per-model diff.
//   5. On --apply, writes the new task_fitness back to the DB.
//
// Usage:
//   npx tsx scripts/migrate-task-fitness-v0.8.ts            # dry-run
//   npx tsx scripts/migrate-task-fitness-v0.8.ts --apply    # commit
//
// Provenance: all five derived keys are "derived"-equivalent — they
// have no benchmark grounding. The admin UI provenance dots will show
// this. Re-grounding via the admin Reground action (or the
// scripts/reground-registry.ts script) will overwrite math/reasoning
// with benchmark-derived values where snapshots exist; comms/research
// remain derived until new benchmark sources are added (planned for
// v0.8.1 — see docs/plans/2026-05-19-task-types-review.md).

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { neon } from '@neondatabase/serverless'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const apply = process.argv.includes('--apply')

interface ModelRow {
  slug: string
  task_fitness: Record<string, number>
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function migrate(old: Record<string, number>): Record<string, number> {
  const summarise = old.summarise ?? 0.5
  const extract = old.extract ?? 0.5
  const generate = old.generate ?? 0.5
  const code = old.code ?? 0.5
  const analyse = old.analyse ?? 0.5
  const translate = old.translate ?? 0.5
  const conversation = old.conversation ?? 0.5

  return {
    summarise: round2(summarise),
    extract: round2(extract),
    generate: round2(generate),
    comms: round2(0.85 * generate),
    code: round2(code),
    math: round2((code + analyse) / 2),
    reasoning: round2(analyse),
    analyse: round2(analyse),
    research: round2(0.70 * analyse),
    qa: round2(0.60 * analyse + 0.40 * conversation),
    translate: round2(translate),
    conversation: round2(conversation),
  }
}

function formatDiff(slug: string, before: Record<string, number>, after: Record<string, number>): string {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
  const lines: string[] = []
  for (const k of [...allKeys].sort()) {
    const b = before[k]
    const a = after[k]
    if (b === undefined) {
      lines.push(`    + ${k.padEnd(13)} = ${a}`)
    } else if (a === undefined) {
      lines.push(`    - ${k.padEnd(13)} (was ${b})`)
    } else if (b !== a) {
      lines.push(`      ${k.padEnd(13)} ${b} → ${a}`)
    }
  }
  return `  ${slug}\n${lines.join('\n')}`
}

async function main() {
  const dbUrl = process.env.NEON_DATABASE_URL
  if (!dbUrl) {
    console.error('NEON_DATABASE_URL not set')
    process.exit(1)
  }
  const sql = neon(dbUrl)

  const rows = (await sql`
    SELECT slug, task_fitness
    FROM models
    WHERE active = true
    ORDER BY slug
  `) as unknown as ModelRow[]

  console.log(`Loaded ${rows.length} active models from DB.`)

  // 1. Backup — always, even in dry-run.
  const backupDir = join(__dirname, '..', 'data', 'backups')
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(backupDir, `task_fitness_pre_v0.8.0_${stamp}.json`)
  const backup = rows.map(r => ({ slug: r.slug, task_fitness: r.task_fitness }))
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8')
  console.log(`Backup written: ${backupPath}`)

  // 2. Compute migration + diff.
  const migrated = rows.map(r => ({
    slug: r.slug,
    before: r.task_fitness,
    after: migrate(r.task_fitness),
  }))

  console.log('\nProposed changes:\n')
  for (const m of migrated) {
    console.log(formatDiff(m.slug, m.before, m.after))
  }

  if (!apply) {
    console.log('\nDry-run — no changes written. Pass --apply to commit.')
    return
  }

  // 3. Apply.
  console.log('\nApplying...')
  for (const m of migrated) {
    await sql`
      UPDATE models
      SET task_fitness = ${JSON.stringify(m.after)}::jsonb,
          updated_at = NOW()
      WHERE slug = ${m.slug}
    `
  }
  console.log(`Updated task_fitness on ${migrated.length} models.`)
  console.log('Next step: regenerate src/data/bearing-registry.json via `npx tsx scripts/generate-registry.ts`.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
