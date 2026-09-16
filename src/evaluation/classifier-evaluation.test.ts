import { describe, expect, it } from 'vitest'
import type { Classification } from '@/lib/classification'
import {
  classifierErrorResult,
  evaluateClassifierResult,
  summariseClassifierEvaluation,
  type ClassifierEvalCase,
} from './classifier-evaluation'

const baseClassification: Classification = {
  task_type: 'summarise',
  task_subtype: null,
  complexity: 'moderate',
  input_length: 'long',
  needs_vision: false,
  needs_tools: false,
  needs_code: false,
  needs_reasoning: true,
  is_recurring: false,
  data_sensitivity: 'none',
  latency_target: 'interactive',
  volume: 'one_off',
  needs_long_context: false,
  needs_multilingual: false,
  is_agentic: false,
  output_length: 'medium',
  confidence: 0.8,
  clarification_needed: false,
  suggested_questions: [],
  pipeline_recommended: false,
  pipeline_stages: null,
}

const testCase: ClassifierEvalCase = {
  id: 'summary',
  description: 'Summarise this report.',
  why: 'Test case',
  expected: {
    taskType: 'summarise',
    complexity: 'moderate',
    needsReasoning: true,
    clarificationNeeded: false,
  },
}

describe('classifier evaluation', () => {
  it('checks only fields with explicit expectations', () => {
    const result = evaluateClassifierResult(testCase, baseClassification)
    expect(result.checks).toHaveLength(4)
    expect(result.checks.every((check) => check.passed)).toBe(true)
  })

  it('reports field-specific accuracy separately from confidence', () => {
    const first = evaluateClassifierResult(testCase, baseClassification)
    const second = evaluateClassifierResult(testCase, {
      ...baseClassification,
      task_type: 'research',
      clarification_needed: true,
      confidence: 0.6,
    })
    const summary = summariseClassifierEvaluation([first, second])

    expect(summary.taskTypeAccuracy).toBe(0.5)
    expect(summary.clarificationAccuracy).toBe(0.5)
    expect(summary.averageConfidence).toBeCloseTo(0.7)
    expect(summary.fieldAccuracy).toBe(0.75)
  })

  it('keeps live call failures visible without inventing failed field checks', () => {
    const summary = summariseClassifierEvaluation([
      classifierErrorResult(testCase, new Error('provider unavailable')),
    ])

    expect(summary.failedCalls).toBe(1)
    expect(summary.checkedFields).toBe(0)
    expect(summary.taskTypeAccuracy).toBeNull()
  })
})
