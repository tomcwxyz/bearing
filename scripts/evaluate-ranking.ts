import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { evaluateGoldenCorpus, type GoldenTaskEvaluation } from '../src/evaluation/golden-evaluation'
import { GOLDEN_TASKS } from '../src/evaluation/golden-tasks'
import {
  baselineFromEvaluations,
  compareApprovedBaseline,
  type RankingBaseline,
} from '../src/evaluation/ranking-baseline'
import { compareShadowRankings, withBenchmarkBlend } from '../src/evaluation/shadow-ranking'
import { ALL_TASK_TYPES, getAllModels } from '../src/lib/registry'

const BASELINE_PATH = resolve(process.cwd(), 'src/evaluation/baselines/ranking-v1.json')

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

/**
 * CI has no database credentials, so its candidate shadow run uses a stable,
 * small synthetic benchmark perturbation around curated scores. This exercises
 * benchmark blending deterministically without pretending those values are real
 * evidence. Set SHADOW_USE_LIVE_BENCHMARKS=1 in an environment with Neon access
 * to evaluate against the latest actual benchmark snapshots instead.
 */
function syntheticBenchmarkScores(): Map<string, number> {
  const scores = new Map<string, number>()
  for (const model of getAllModels()) {
    for (const taskType of ALL_TASK_TYPES) {
      const curated = model.task_fitness[taskType]
      if (curated == null) continue
      const bucket = hash(`${model.slug}::${taskType}`) % 17
      const delta = (bucket - 8) / 100 // deterministic -0.08 .. +0.08
      scores.set(`${model.slug}::${taskType}`, Math.max(0, Math.min(1, curated + delta)))
    }
  }
  return scores
}

async function candidateBenchmarkScores(): Promise<{ scores: Map<string, number>; source: string }> {
  if (process.env.SHADOW_USE_LIVE_BENCHMARKS === '1') {
    const { getLatestBenchmarkScores } = await import('../src/lib/benchmarks')
    return { scores: await getLatestBenchmarkScores(), source: 'live benchmark snapshots' }
  }
  return { scores: syntheticBenchmarkScores(), source: 'deterministic synthetic benchmark fixture' }
}

function printGoldenFailures(evaluations: GoldenTaskEvaluation[]) {
  const failures = evaluations.filter((evaluation) => evaluation.issues.length > 0)
  if (failures.length === 0) return

  console.error('\nGolden invariant failures:')
  for (const failure of failures) {
    console.error(`- ${failure.id}: ${failure.issues.join('; ')}`)
  }
}

function printBaselineDrift(report: ReturnType<typeof compareApprovedBaseline>) {
  console.log('\nApproved baseline drift')
  console.log(`Tasks: ${report.taskCount} · changed top: ${report.changedTopCount} · high: ${report.highImpactCount} · medium: ${report.mediumImpactCount} · low: ${report.lowImpactCount}`)

  for (const change of report.changes.filter((item) => item.impact !== 'none')) {
    console.log(
      `- [${change.impact}] ${change.id}: ${change.approvedTop ?? 'none'} → ${change.currentTop ?? 'none'}; ` +
      `top3 overlap ${change.top3Overlap}/3; max top5 shift ${change.maxApprovedTop5RankShift}; eligible Δ ${change.eligibleCountDelta}`,
    )
  }
}

function printShadow(report: ReturnType<typeof compareShadowRankings>, label: string) {
  console.log(`\nCandidate shadow — ${label}`)
  console.log(`Tasks: ${report.taskCount} · changed top: ${report.changedTopCount} · high: ${report.highImpactCount} · medium: ${report.mediumImpactCount} · low: ${report.lowImpactCount}`)

  for (const change of report.changes.filter((item) => item.impact !== 'none')) {
    console.log(
      `- [${change.impact}] ${change.id}: ${change.baselineTop ?? 'none'} → ${change.candidateTop ?? 'none'}; ` +
      `top3 ${change.baselineTop3.join(', ')} → ${change.candidateTop3.join(', ')}; eligible Δ ${change.eligibleCountDelta}`,
    )
  }
}

async function main() {
  const writeBaseline = process.argv.includes('--write-baseline')
  const blend = Number(process.env.SHADOW_BENCHMARK_BLEND ?? '0.20')
  const candidateBlend = Number.isFinite(blend) ? Math.max(0, Math.min(1, blend)) : 0.20

  const baselineEvaluations = withBenchmarkBlend(0, () => evaluateGoldenCorpus(GOLDEN_TASKS))
  printGoldenFailures(baselineEvaluations)
  const goldenFailures = baselineEvaluations.filter((evaluation) => evaluation.issues.length > 0).length
  if (goldenFailures > 0) process.exitCode = 1

  const currentBaseline = baselineFromEvaluations(baselineEvaluations)

  if (writeBaseline) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(currentBaseline, null, 2)}\n`)
    console.log(`\nWrote approved baseline: ${BASELINE_PATH}`)
  } else if (existsSync(BASELINE_PATH)) {
    const approved = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as RankingBaseline
    const drift = compareApprovedBaseline(approved, currentBaseline)
    printBaselineDrift(drift)
    if (drift.highImpactCount > 0) {
      console.error('\nUnapproved high-impact ranking drift detected. Review the changes, then update the baseline explicitly if accepted.')
      process.exitCode = 1
    }
  } else {
    console.log('\nNo approved ranking baseline exists yet. Current baseline follows as BASELINE_SNAPSHOT_JSON for first-time approval.')
    console.log(`BASELINE_SNAPSHOT_JSON=${JSON.stringify(currentBaseline)}`)
  }

  const candidateBenchmarks = await candidateBenchmarkScores()
  const candidateEvaluations = withBenchmarkBlend(candidateBlend, () =>
    evaluateGoldenCorpus(GOLDEN_TASKS, candidateBenchmarks.scores),
  )
  const shadow = compareShadowRankings(baselineEvaluations, candidateEvaluations)
  printShadow(shadow, `benchmark blend ${candidateBlend.toFixed(2)} using ${candidateBenchmarks.source}`)

  if (process.env.SHADOW_FAIL_ON_HIGH === '1' && shadow.highImpactCount > 0) {
    console.error('\nCandidate policy produced high-impact shadow changes.')
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
