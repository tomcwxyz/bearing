import { describe, expect, it } from 'vitest'

import { scoringInputFromTask, type TaskScoringSource } from './scoring-input'

const baseTask: TaskScoringSource = {
  task_type: 'writing',
  complexity: 'moderate',
  input_length: 'medium',
  needs_vision: false,
  needs_tools: false,
  needs_code: false,
}

describe('scoringInputFromTask', () => {
  it('uses deterministic defaults for optional task dimensions', () => {
    expect(scoringInputFromTask(baseTask)).toMatchObject({
      taskType: 'writing',
      complexity: 'moderate',
      inputLength: 'medium',
      needsReasoning: false,
      dataSensitivity: 'none',
      latencyTarget: 'interactive',
      volume: 'one_off',
      needsLongContext: false,
      needsMultilingual: false,
      isAgentic: false,
      outputLength: 'medium',
      priorityOrder: [
        'quality',
        'cost',
        'speed',
        'capability',
        'privacy',
        'sustainability',
        'transparency',
      ],
      excludedFactors: [],
    })
  })

  it('parses persisted JSON priority and exclusion arrays', () => {
    const result = scoringInputFromTask({
      ...baseTask,
      priority_order: '["privacy","quality","capability","transparency","cost","sustainability","speed"]',
      excluded_factors: '["speed","sustainability"]',
      needs_reasoning: true,
      data_sensitivity: 'pii',
    })

    expect(result.priorityOrder[0]).toBe('privacy')
    expect(result.excludedFactors).toEqual(['speed', 'sustainability'])
    expect(result.needsReasoning).toBe(true)
    expect(result.dataSensitivity).toBe('pii')
  })

  it('falls back rather than throwing on malformed persisted arrays', () => {
    const result = scoringInputFromTask({
      ...baseTask,
      priority_order: '{not json}',
      excluded_factors: 'null',
    })

    expect(result.priorityOrder).toHaveLength(7)
    expect(result.priorityOrder[0]).toBe('quality')
    expect(result.excludedFactors).toEqual([])
  })

  it('passes benchmark evidence through unchanged', () => {
    const benchmarks = new Map<string, number>([['model::writing', 0.8]])
    const result = scoringInputFromTask(baseTask, benchmarks)

    expect(result.benchmarkScores).toBe(benchmarks)
  })
})
