import { describe, it, expect } from 'vitest'
import { scorePipelineStage, scorePipeline } from '../pipeline'
import type { Factor } from '../registry'

const defaultPriorities: Factor[] = ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']

describe('scorePipelineStage', () => {
  it('returns recommended and alternative for a stage', () => {
    const result = scorePipelineStage({
      taskType: 'extract',
      inputLength: 'long',
      requiresCapabilities: ['vision'],
      priorityOrder: defaultPriorities,
    })
    expect(result.recommended).toBeDefined()
    expect(result.recommended.slug).toBeTruthy()
    expect(result.recommended.capabilities).toContain('vision')
    if (result.alternative) {
      expect(result.alternative.capabilities).toContain('vision')
    }
  })

  it('returns models without capability filter when empty', () => {
    const result = scorePipelineStage({
      taskType: 'summarise',
      inputLength: 'medium',
      requiresCapabilities: [],
      priorityOrder: defaultPriorities,
    })
    expect(result.recommended).toBeDefined()
  })
})

describe('scorePipelineStage outputLength', () => {
  it('honours outputLength when costing the stage', () => {
    const longOut = scorePipelineStage({
      taskType: 'extract',
      inputLength: 'long',
      outputLength: 'very_long',
      requiresCapabilities: [],
      priorityOrder: defaultPriorities,
    })
    const shortOut = scorePipelineStage({
      taskType: 'extract',
      inputLength: 'long',
      outputLength: 'short',
      requiresCapabilities: [],
      priorityOrder: defaultPriorities,
    })
    expect(longOut.recommended.estimatedCost).toBeGreaterThan(
      shortOut.recommended.estimatedCost
    )
  })
})

describe('scorePipeline', () => {
  it('scores a multi-stage pipeline', () => {
    const result = scorePipeline({
      stages: [
        { stage: 1, task_type: 'extract', description: 'Extract from PDF', requires_capabilities: ['vision'] },
        { stage: 2, task_type: 'summarise', description: 'Summarise content', requires_capabilities: [] },
      ],
      inputLength: 'long',
      priorityOrder: defaultPriorities,
    })
    expect(result.stages).toHaveLength(2)
    expect(result.stages[0].recommended.slug).toBeTruthy()
    expect(result.stages[1].recommended.slug).toBeTruthy()
    expect(result.totalEstimatedCost).toBeGreaterThan(0)
  })

  it('uses per-stage input_length, output_length, needs_reasoning overrides', () => {
    const result = scorePipeline({
      stages: [
        {
          stage: 1,
          task_type: 'extract',
          description: 'OCR',
          requires_capabilities: ['vision'],
          input_length: 'long',
          output_length: 'long',
          needs_reasoning: false,
        },
        {
          stage: 2,
          task_type: 'summarise',
          description: 'Summarise',
          requires_capabilities: [],
          input_length: 'long',
          output_length: 'short',
          needs_reasoning: false,
        },
      ],
      inputLength: 'short',
      outputLength: 'very_long',
      priorityOrder: defaultPriorities,
    })
    expect(result.stages[1].recommended.estimatedCost)
      .toBeLessThan(result.stages[0].recommended.estimatedCost)
  })

  it('falls back to task-level input/output length when stage omits them', () => {
    const result = scorePipeline({
      stages: [
        { stage: 1, task_type: 'extract', description: 'x', requires_capabilities: [] },
      ],
      inputLength: 'long',
      outputLength: 'very_long',
      priorityOrder: defaultPriorities,
    })
    expect(result.stages[0].recommended.estimatedCost).toBeGreaterThan(0)
  })
})
