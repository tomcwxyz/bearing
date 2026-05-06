// Re-ground every active registry model against its existing benchmark
// aliases + provider profile. Dry-run by default; pass --apply to write
// the merged model rows back via upsertModel.
//
//   npx tsx scripts/reground-registry.ts                  # print diff
//   npx tsx scripts/reground-registry.ts --apply          # commit
//   npx tsx scripts/reground-registry.ts --include-speed  # also overwrite speed_score
//
// What gets overwritten when --apply is passed:
//   - task_fitness[task]      for any task with benchmark coverage
//   - privacy_score            from provider profile
//   - transparency.open_weights and transparency.transparency_score
//   - capabilities (adds/removes 'code' based on grounded code score)
//
// Speed_score is preserved by default — AA's cohort spans 513 models so
// raw cohort positioning would push flagships near the bottom and clobber
// curated within-tier expectations. Pass --include-speed to override.
//
// Untouched: tier, strengths, weaknesses, sustainability, transparency
// notes/sub-fields, all other capabilities.

import { config } from 'dotenv'
config({ path: '.env.local' })

import { getAllModelsFromDb, upsertModel, getOpenRouterIds } from '../src/lib/db'
import { getAliasesForBearingSlug } from '../src/lib/benchmarks'
import { groundFromAliases, CODE_CAPABILITY_THRESHOLD } from '../src/lib/import-grounding'

interface Diff {
  field: string
  before: unknown
  after: unknown
}

function diffField(field: string, before: unknown, after: unknown, eps = 0.01): Diff | null {
  if (typeof before === 'number' && typeof after === 'number') {
    return Math.abs(before - after) > eps ? { field, before, after } : null
  }
  return JSON.stringify(before) !== JSON.stringify(after) ? { field, before, after } : null
}

async function main() {
  const apply = process.argv.includes('--apply')
  const includeSpeed = process.argv.includes('--include-speed')
  console.log(`Mode: ${apply ? 'APPLY (writing to models)' : 'DRY-RUN'}`)
  console.log(`speed_score: ${includeSpeed ? 'will overwrite from AA cohort' : 'preserved (curated)'}\n`)

  const [models, orIdMap] = await Promise.all([getAllModelsFromDb(), getOpenRouterIds()])
  // getOpenRouterIds returns Map<openrouter_id, bearing_slug>; invert for our lookup.
  const slugToOrId = new Map<string, string>()
  for (const [orId, slug] of orIdMap) slugToOrId.set(slug, orId)
  let totalDiffs = 0
  let modelsTouched = 0
  let modelsWithoutAliases = 0

  for (const m of models) {
    const aliases = await getAliasesForBearingSlug(m.slug)
    const grounded = await groundFromAliases(aliases, m.provider)

    const diffs: Diff[] = []
    // task_fitness
    const newTaskFitness = { ...m.task_fitness }
    for (const [task, gf] of Object.entries(grounded.taskFitness)) {
      if (!gf) continue
      const before = m.task_fitness[task]
      newTaskFitness[task] = gf.value
      const d = diffField(`task_fitness.${task}`, before, gf.value)
      if (d) diffs.push(d)
    }

    // speed_score: opt-in. AA's cohort spans 513 models so raw positioning
    // would clobber curated within-tier expectations on existing models.
    let newSpeed = m.speed_score
    if (includeSpeed && grounded.speedScore) {
      newSpeed = grounded.speedScore.value
      const d = diffField('speed_score', m.speed_score, newSpeed)
      if (d) diffs.push(d)
    }

    // privacy_score: always overwrite from provider profile
    const newPrivacy = grounded.privacyScore.value
    const dp = diffField('privacy_score', m.privacy_score, newPrivacy)
    if (dp) diffs.push(dp)

    // transparency anchors
    const newTransparency = {
      ...m.transparency,
      open_weights: grounded.openWeights.value,
      transparency_score: grounded.baselineTransparency.value,
    }
    const dow = diffField('transparency.open_weights', m.transparency.open_weights, newTransparency.open_weights)
    if (dow) diffs.push(dow)
    const dts = diffField('transparency.transparency_score', m.transparency.transparency_score, newTransparency.transparency_score)
    if (dts) diffs.push(dts)

    // capabilities — code derived from grounded score
    let newCaps = [...m.capabilities]
    const gCode = grounded.taskFitness.code
    if (gCode != null) {
      const shouldHaveCode = gCode.value >= CODE_CAPABILITY_THRESHOLD
      const has = newCaps.includes('code')
      if (shouldHaveCode && !has) {
        newCaps = [...newCaps, 'code']
        diffs.push({ field: 'capabilities.code', before: false, after: true })
      } else if (!shouldHaveCode && has) {
        newCaps = newCaps.filter(c => c !== 'code')
        diffs.push({ field: 'capabilities.code', before: true, after: false })
      }
    }

    if (aliases.length === 0) modelsWithoutAliases++
    if (diffs.length === 0) continue

    modelsTouched++
    totalDiffs += diffs.length
    console.log(`\n${m.slug}  (${m.provider})  — ${diffs.length} change(s):`)
    for (const d of diffs) {
      console.log(`  ${d.field.padEnd(36)} ${String(d.before).padEnd(8)} → ${d.after}`)
    }

    if (apply) {
      await upsertModel({
        slug: m.slug,
        name: m.name,
        provider: m.provider,
        tier: m.tier,
        pricing: m.pricing,
        context_window: m.context_window,
        capabilities: newCaps,
        strengths: m.strengths,
        weaknesses: m.weaknesses,
        task_fitness: newTaskFitness,
        speed_score: newSpeed,
        privacy_score: newPrivacy,
        transparency: newTransparency,
        sustainability: m.sustainability,
        openrouter_id: slugToOrId.get(m.slug) ?? null,
      })
    }
  }

  console.log(`\n──────`)
  console.log(`Total models:                 ${models.length}`)
  console.log(`Models with no aliases:       ${modelsWithoutAliases}`)
  console.log(`Models touched:               ${modelsTouched}`)
  console.log(`Total field changes:          ${totalDiffs}`)
  if (!apply) console.log(`\nRe-run with --apply to commit.`)
}

main().catch(err => { console.error(err); process.exit(1) })
