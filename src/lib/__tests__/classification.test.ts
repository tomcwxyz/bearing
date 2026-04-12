import { describe, it, expect } from 'vitest'
import { buildClassificationMessages, parseClassificationResponse, type Classification } from '../classification'

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
