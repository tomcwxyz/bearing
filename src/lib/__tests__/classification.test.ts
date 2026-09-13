import { describe, expect, it } from 'vitest'
import { ALL_TASK_TYPES } from '../registry'
import {
  buildClassificationMessages,
  parseClassificationResponse,
  validateClassification,
  CLASSIFY_TOOL,
  type Classification,
} from '../classification'

function validClassification(overrides: Partial<Classification> = {}): Classification {
  return {
    task_type: 'summarise',
    task_subtype: 'meeting_notes',
    complexity: 'simple',
    input_length: 'medium',
    needs_vision: false,
    needs_tools: false,
    needs_code: false,
    needs_reasoning: false,
    is_recurring: true,
    data_sensitivity: 'none',
    latency_target: 'interactive',
    volume: 'one_off',
    needs_long_context: false,
    needs_multilingual: false,
    is_agentic: false,
    output_length: 'medium',
    confidence: 0.9,
    clarification_needed: false,
    suggested_questions: [],
    pipeline_recommended: false,
    pipeline_stages: null,
    ...overrides,
  }
}

describe('classification messages', () => {
  it('builds messages from a task description', () => {
    const messages = buildClassificationMessages('I need to summarise meeting notes weekly')
    expect(messages.system).toBeDefined()
    expect(messages.userMessage).toContain('summarise meeting notes')
  })

  it('builds messages with clarification answers', () => {
    const messages = buildClassificationMessages(
      'I need to summarise meeting notes weekly',
      [{ question: 'How long are the notes?', answer: 'A page' }],
    )
    expect(messages.userMessage).toContain('A page')
  })
})

describe('runtime classification validation', () => {
  it('parses a complete valid classification response', () => {
    const result = parseClassificationResponse(JSON.stringify(validClassification()))
    expect(result.task_type).toBe('summarise')
    expect(result.confidence).toBe(0.9)
    expect(result.clarification_needed).toBe(false)
  })

  it('parses response wrapped in markdown code fences', () => {
    const raw = `\`\`\`json\n${JSON.stringify(validClassification({ task_type: 'code', needs_code: true }))}\n\`\`\``
    const result = parseClassificationResponse(raw)
    expect(result.task_type).toBe('code')
    expect(result.needs_code).toBe(true)
  })

  it('accepts task_type=embedding', () => {
    const result = validateClassification(validClassification({
      task_type: 'embedding',
      task_subtype: 'rag_index_build',
      confidence: 0.88,
    }))
    expect(result.task_type).toBe('embedding')
  })

  it('rejects a missing field that TypeScript alone cannot protect at runtime', () => {
    const input = validClassification() as unknown as Record<string, unknown>
    delete input.needs_reasoning

    expect(() => validateClassification(input)).toThrow(/needs_reasoning/)
  })

  it('rejects unknown task types before scoring', () => {
    const input = { ...validClassification(), task_type: 'other' }
    expect(() => validateClassification(input)).toThrow(/task_type must be one of/)
  })

  it('rejects out-of-range confidence', () => {
    const input = { ...validClassification(), confidence: 1.4 }
    expect(() => validateClassification(input)).toThrow(/between 0 and 1/)
  })

  it('drops unknown keys rather than carrying model output through unchecked', () => {
    const result = validateClassification({ ...validClassification(), invented_field: 'surprise' }) as Classification & {
      invented_field?: string
    }
    expect(result.invented_field).toBeUndefined()
  })

  it('throws on invalid JSON before validation', () => {
    expect(() => parseClassificationResponse('not json')).toThrow()
  })
})

describe('pipeline classification validation', () => {
  const pipelineStages: NonNullable<Classification['pipeline_stages']> = [
    {
      stage: 1,
      task_type: 'extract',
      description: 'Extract text from PDF',
      requires_capabilities: ['vision'],
      input_length: 'long',
      output_length: 'long',
      needs_reasoning: false,
    },
    {
      stage: 2,
      task_type: 'summarise',
      description: 'Summarise extracted content',
      requires_capabilities: [],
      input_length: 'long',
      output_length: 'short',
    },
  ]

  it('parses valid pipeline fields', () => {
    const result = validateClassification(validClassification({
      task_type: 'extract',
      complexity: 'complex',
      input_length: 'long',
      needs_vision: true,
      pipeline_recommended: true,
      pipeline_stages: pipelineStages,
    }))

    expect(result.pipeline_recommended).toBe(true)
    expect(result.pipeline_stages).toHaveLength(2)
    expect(result.pipeline_stages?.[0].requires_capabilities).toEqual(['vision'])
  })

  it('rejects pipeline_recommended without any stages', () => {
    expect(() => validateClassification({
      ...validClassification(),
      pipeline_recommended: true,
      pipeline_stages: [],
    })).toThrow(/at least one stage/)
  })

  it('rejects unknown pipeline capabilities', () => {
    const invalidStages = [{
      ...pipelineStages[0],
      requires_capabilities: ['telepathy'],
    }]

    expect(() => validateClassification({
      ...validClassification(),
      pipeline_recommended: true,
      pipeline_stages: invalidStages,
    })).toThrow(/requires_capabilities/)
  })
})

// We can't invoke Anthropic in unit tests, so pin the tightened pipeline rule
// into the system prompt as a regression guard.
describe('pipeline rule', () => {
  it('system prompt forbids pipelines for chatbots', () => {
    const { system } = buildClassificationMessages('placeholder')
    expect(system).toMatch(/chatbots are not pipelines/i)
  })

  it('system prompt forbids pipelines for code + tests + refactor', () => {
    const { system } = buildClassificationMessages('placeholder')
    expect(system).toMatch(/one job, one model/i)
  })

  it('system prompt requires different task_type AND non-shareable models', () => {
    const { system } = buildClassificationMessages('placeholder')
    expect(system).toMatch(/different task_type values/i)
    expect(system).toMatch(/Cannot share a single model efficiently/i)
  })
})

describe('CLASSIFY_TOOL schema', () => {
  it('uses the canonical task enum rather than a duplicated list', () => {
    const enumValues = (CLASSIFY_TOOL.input_schema.properties.task_type as { enum: string[] }).enum
    expect(enumValues).toEqual([...ALL_TASK_TYPES])
  })

  it('marks every top-level Classification field as required', () => {
    const required = new Set(CLASSIFY_TOOL.input_schema.required)
    const fields: Array<keyof Classification> = [
      'task_type', 'task_subtype', 'complexity', 'input_length',
      'needs_vision', 'needs_tools', 'needs_code', 'needs_reasoning', 'is_recurring',
      'data_sensitivity', 'latency_target', 'volume', 'needs_long_context',
      'needs_multilingual', 'is_agentic', 'output_length', 'confidence',
      'clarification_needed', 'suggested_questions', 'pipeline_recommended', 'pipeline_stages',
    ]

    for (const field of fields) expect(required.has(field)).toBe(true)
    expect(required.size).toBe(fields.length)
  })

  it('accepts per-stage input_length, output_length and needs_reasoning', () => {
    const pipeline = CLASSIFY_TOOL.input_schema.properties.pipeline_stages
    expect(pipeline.items.properties).toHaveProperty('input_length')
    expect(pipeline.items.properties).toHaveProperty('output_length')
    expect(pipeline.items.properties).toHaveProperty('needs_reasoning')
  })
})
