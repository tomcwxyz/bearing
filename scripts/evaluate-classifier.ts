import { CLASSIFIER_EVAL_CASES } from '../src/evaluation/classifier-cases'
import {
  classifierErrorResult,
  evaluateClassifierResult,
  summariseClassifierEvaluation,
  type ClassifierEvalResult,
} from '../src/evaluation/classifier-evaluation'
import { classifyTask } from '../src/lib/classification'

function parseLimit(): number | null {
  const argument = process.argv.find((item) => item.startsWith('--limit='))
  if (!argument) return null
  const value = Number(argument.split('=')[1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

function percent(value: number | null): string {
  return value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required for live classifier evaluation.')
  }

  const limit = parseLimit()
  const cases = limit ? CLASSIFIER_EVAL_CASES.slice(0, limit) : CLASSIFIER_EVAL_CASES
  const results: ClassifierEvalResult[] = []

  console.log(`Running live classifier evaluation for ${cases.length} case(s)...`)

  for (const testCase of cases) {
    try {
      const actual = await classifyTask(testCase.description)
      const result = evaluateClassifierResult(testCase, actual)
      results.push(result)

      const failures = result.checks.filter((check) => !check.passed)
      const status = failures.length === 0 ? 'PASS' : 'DRIFT'
      console.log(`- ${status} ${testCase.id} · confidence ${actual.confidence.toFixed(2)}`)
      for (const failure of failures) {
        console.log(`    ${failure.field}: expected ${String(failure.expected)}, got ${String(failure.actual)}`)
      }
    } catch (error) {
      results.push(classifierErrorResult(testCase, error))
      console.log(`- ERROR ${testCase.id} · ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const summary = summariseClassifierEvaluation(results)
  console.log('\nClassifier evaluation summary')
  console.log(`Cases: ${summary.caseCount} · completed: ${summary.completedCount} · call failures: ${summary.failedCalls}`)
  console.log(`Checked fields: ${summary.checkedFields} · field accuracy: ${percent(summary.fieldAccuracy)}`)
  console.log(`Task type: ${percent(summary.taskTypeAccuracy)} · clarification: ${percent(summary.clarificationAccuracy)} · pipeline: ${percent(summary.pipelineAccuracy)}`)
  console.log(`Average reported confidence: ${summary.averageConfidence == null ? 'n/a' : summary.averageConfidence.toFixed(2)}`)

  if (process.argv.includes('--json')) {
    console.log(`CLASSIFIER_EVAL_JSON=${JSON.stringify({ summary, results })}`)
  }

  // Live model output is evidence, not a deterministic CI invariant. Keep this
  // runner non-blocking by default. Teams can opt into thresholds explicitly
  // after enough runs exist to establish a useful baseline.
  if (process.env.CLASSIFIER_EVAL_FAIL_ON_REGRESSION === '1') {
    const minimumTaskType = Number(process.env.CLASSIFIER_EVAL_MIN_TASK_TYPE ?? '0.80')
    const minimumField = Number(process.env.CLASSIFIER_EVAL_MIN_FIELD ?? '0.80')
    const failed = summary.failedCalls > 0 ||
      (summary.taskTypeAccuracy != null && summary.taskTypeAccuracy < minimumTaskType) ||
      summary.fieldAccuracy < minimumField

    if (failed) {
      console.error('\nClassifier evaluation fell below the explicitly configured regression threshold.')
      process.exitCode = 1
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
