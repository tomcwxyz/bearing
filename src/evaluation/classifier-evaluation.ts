import type { Classification } from '@/lib/classification'

export interface ClassifierEvalExpectation {
  taskType?: string
  complexity?: string
  inputLength?: string
  outputLength?: string
  needsVision?: boolean
  needsTools?: boolean
  needsCode?: boolean
  needsReasoning?: boolean
  dataSensitivity?: string
  latencyTarget?: string
  volume?: string
  needsLongContext?: boolean
  needsMultilingual?: boolean
  isAgentic?: boolean
  clarificationNeeded?: boolean
  pipelineRecommended?: boolean
}

export interface ClassifierEvalCase {
  id: string
  description: string
  why: string
  expected: ClassifierEvalExpectation
}

export interface ClassifierEvalResult {
  id: string
  description: string
  expected: ClassifierEvalExpectation
  actual: Classification | null
  error: string | null
  checks: Array<{ field: string; expected: unknown; actual: unknown; passed: boolean }>
}

export interface ClassifierEvalSummary {
  caseCount: number
  completedCount: number
  failedCalls: number
  checkedFields: number
  passedFields: number
  fieldAccuracy: number
  taskTypeAccuracy: number | null
  clarificationAccuracy: number | null
  pipelineAccuracy: number | null
  averageConfidence: number | null
}

const FIELD_MAP: Array<{
  expectation: keyof ClassifierEvalExpectation
  actual: keyof Classification
}> = [
  { expectation: 'taskType', actual: 'task_type' },
  { expectation: 'complexity', actual: 'complexity' },
  { expectation: 'inputLength', actual: 'input_length' },
  { expectation: 'outputLength', actual: 'output_length' },
  { expectation: 'needsVision', actual: 'needs_vision' },
  { expectation: 'needsTools', actual: 'needs_tools' },
  { expectation: 'needsCode', actual: 'needs_code' },
  { expectation: 'needsReasoning', actual: 'needs_reasoning' },
  { expectation: 'dataSensitivity', actual: 'data_sensitivity' },
  { expectation: 'latencyTarget', actual: 'latency_target' },
  { expectation: 'volume', actual: 'volume' },
  { expectation: 'needsLongContext', actual: 'needs_long_context' },
  { expectation: 'needsMultilingual', actual: 'needs_multilingual' },
  { expectation: 'isAgentic', actual: 'is_agentic' },
  { expectation: 'clarificationNeeded', actual: 'clarification_needed' },
  { expectation: 'pipelineRecommended', actual: 'pipeline_recommended' },
]

export function evaluateClassifierResult(
  testCase: ClassifierEvalCase,
  actual: Classification,
): ClassifierEvalResult {
  const checks = FIELD_MAP.flatMap(({ expectation, actual: actualField }) => {
    const expectedValue = testCase.expected[expectation]
    if (expectedValue === undefined) return []
    const actualValue = actual[actualField]
    return [{
      field: expectation,
      expected: expectedValue,
      actual: actualValue,
      passed: actualValue === expectedValue,
    }]
  })

  return {
    id: testCase.id,
    description: testCase.description,
    expected: testCase.expected,
    actual,
    error: null,
    checks,
  }
}

export function classifierErrorResult(
  testCase: ClassifierEvalCase,
  error: unknown,
): ClassifierEvalResult {
  return {
    id: testCase.id,
    description: testCase.description,
    expected: testCase.expected,
    actual: null,
    error: error instanceof Error ? error.message : String(error),
    checks: [],
  }
}

function accuracyForField(results: ClassifierEvalResult[], field: string): number | null {
  const checks = results.flatMap((result) => result.checks.filter((check) => check.field === field))
  if (checks.length === 0) return null
  return checks.filter((check) => check.passed).length / checks.length
}

export function summariseClassifierEvaluation(results: ClassifierEvalResult[]): ClassifierEvalSummary {
  const checks = results.flatMap((result) => result.checks)
  const confidences = results.flatMap((result) => result.actual ? [result.actual.confidence] : [])
  const passedFields = checks.filter((check) => check.passed).length

  return {
    caseCount: results.length,
    completedCount: results.filter((result) => result.actual !== null).length,
    failedCalls: results.filter((result) => result.error !== null).length,
    checkedFields: checks.length,
    passedFields,
    fieldAccuracy: checks.length === 0 ? 0 : passedFields / checks.length,
    taskTypeAccuracy: accuracyForField(results, 'taskType'),
    clarificationAccuracy: accuracyForField(results, 'clarificationNeeded'),
    pipelineAccuracy: accuracyForField(results, 'pipelineRecommended'),
    averageConfidence: confidences.length === 0
      ? null
      : confidences.reduce((sum, value) => sum + value, 0) / confidences.length,
  }
}
