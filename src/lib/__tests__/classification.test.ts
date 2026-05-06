import { describe, it, expect } from 'vitest'
import { buildClassificationMessages, parseClassificationResponse, CLASSIFY_TOOL, type Classification } from '../classification'

describe('classification', () => {
  it('builds messages from a task description', () => {
    const messages = buildClassificationMessages('I need to summarise meeting notes weekly')
    expect(messages.system).toBeDefined()
    expect(messages.userMessage).toContain('summarise meeting notes')
  })

  it('builds messages with clarification answers', () => {
    const messages = buildClassificationMessages(
      'I need to summarise meeting notes weekly',
      [{ question: 'How long are the notes?', answer: 'A page' }]
    )
    expect(messages.userMessage).toContain('A page')
  })

  it('parses a valid classification response', () => {
    const raw = JSON.stringify({
      task_type: 'summarise',
      task_subtype: 'meeting_notes',
      complexity: 'simple',
      input_length: 'medium',
      needs_vision: false,
      needs_tools: false,
      needs_code: false,
      is_recurring: true,
      confidence: 0.9,
      clarification_needed: false,
      suggested_questions: [],
    })
    const result = parseClassificationResponse(raw)
    expect(result.task_type).toBe('summarise')
    expect(result.confidence).toBe(0.9)
    expect(result.clarification_needed).toBe(false)
  })

  it('parses response wrapped in markdown code fences', () => {
    const raw = '```json\n{"task_type":"code","confidence":0.8,"clarification_needed":false,"suggested_questions":[],"task_subtype":null,"complexity":"moderate","input_length":"short","needs_vision":false,"needs_tools":false,"needs_code":true,"is_recurring":false}\n```'
    const result = parseClassificationResponse(raw)
    expect(result.task_type).toBe('code')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseClassificationResponse('not json')).toThrow()
  })
})

describe('parseClassificationResponse - pipeline', () => {
  it('parses pipeline fields when present', () => {
    const raw = JSON.stringify({
      task_type: 'extract',
      task_subtype: 'document_processing',
      complexity: 'complex',
      input_length: 'long',
      needs_vision: true,
      needs_tools: false,
      needs_code: false,
      is_recurring: false,
      confidence: 0.9,
      clarification_needed: false,
      suggested_questions: [],
      pipeline_recommended: true,
      pipeline_stages: [
        { stage: 1, task_type: 'extract', description: 'Extract text from PDF', requires_capabilities: ['vision'] },
        { stage: 2, task_type: 'summarise', description: 'Summarise extracted content', requires_capabilities: [] },
      ],
    })
    const result = parseClassificationResponse(raw)
    expect(result.pipeline_recommended).toBe(true)
    expect(result.pipeline_stages).toHaveLength(2)
    expect(result.pipeline_stages![0].task_type).toBe('extract')
    expect(result.pipeline_stages![0].requires_capabilities).toEqual(['vision'])
  })

  it('handles non-pipeline classification', () => {
    const raw = JSON.stringify({
      task_type: 'summarise',
      task_subtype: null,
      complexity: 'simple',
      input_length: 'medium',
      needs_vision: false,
      needs_tools: false,
      needs_code: false,
      is_recurring: false,
      confidence: 0.95,
      clarification_needed: false,
      suggested_questions: [],
      pipeline_recommended: false,
      pipeline_stages: null,
    })
    const result = parseClassificationResponse(raw)
    expect(result.pipeline_recommended).toBe(false)
    expect(result.pipeline_stages).toBeNull()
  })
})

// Phase 6.2: pin the tightened pipeline-detection rule into the system prompt.
// We can't invoke Anthropic in tests, so we assert the prompt encodes the
// negative-example list — a proxy that catches accidental regressions of the
// rule wording (the most likely failure mode, not the model's interpretation).
describe('pipeline rule (Phase 6)', () => {
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

// Phase 7.1: structured output via tool-use replaces raw JSON parsing.
describe('CLASSIFY_TOOL schema (Phase 7.1)', () => {
  it('exposes a classify_task tool with the full classification schema', () => {
    expect(CLASSIFY_TOOL.name).toBe('classify_task')
    const props = CLASSIFY_TOOL.input_schema.properties
    expect(props).toHaveProperty('task_type')
    expect(props).toHaveProperty('pipeline_recommended')
    expect(props).toHaveProperty('data_sensitivity')
    expect(props).toHaveProperty('output_length')
  })

  it('marks core fields as required', () => {
    const required = CLASSIFY_TOOL.input_schema.required
    for (const field of ['task_type', 'complexity', 'input_length', 'confidence', 'clarification_needed']) {
      expect(required).toContain(field)
    }
  })

  it('accepts per-stage input_length, output_length, needs_reasoning in the schema', () => {
    const c: Classification = {
      task_type: 'extract',
      task_subtype: null,
      complexity: 'moderate',
      input_length: 'long',
      needs_vision: true,
      needs_tools: false,
      needs_code: false,
      needs_reasoning: false,
      is_recurring: false,
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
      pipeline_recommended: true,
      pipeline_stages: [
        {
          stage: 1,
          task_type: 'extract',
          description: 'OCR pages',
          requires_capabilities: ['vision'],
          input_length: 'long',
          output_length: 'long',
          needs_reasoning: false,
        },
        {
          stage: 2,
          task_type: 'summarise',
          description: 'Summarise extraction',
          requires_capabilities: [],
          input_length: 'long',
          output_length: 'short',
        },
      ],
    }
    expect(c.pipeline_stages?.[0].input_length).toBe('long')
    expect(c.pipeline_stages?.[1].output_length).toBe('short')
  })
})
