import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface Classification {
  task_type: string
  task_subtype: string | null
  complexity: string
  input_length: string
  needs_vision: boolean
  needs_tools: boolean
  needs_code: boolean
  needs_reasoning: boolean
  is_recurring: boolean
  data_sensitivity: 'none' | 'pii' | 'regulated_health' | 'regulated_finance' | 'on_prem_required'
  latency_target: 'realtime' | 'interactive' | 'batch'
  volume: 'one_off' | 'hundreds_per_day' | 'thousands_per_day' | 'millions_per_day'
  needs_long_context: boolean
  needs_multilingual: boolean
  is_agentic: boolean
  output_length: 'short' | 'medium' | 'long' | 'very_long'
  confidence: number
  clarification_needed: boolean
  suggested_questions: { question: string; options: string[] }[]
  pipeline_recommended: boolean
  pipeline_stages: {
    stage: number
    task_type: string
    description: string
    requires_capabilities: string[]
    input_length?: 'short' | 'medium' | 'long' | 'very_long'
    output_length?: 'short' | 'medium' | 'long' | 'very_long'
    needs_reasoning?: boolean
  }[] | null
}

export interface ClarificationAnswer {
  question: string
  answer: string
}

let classifyPromptCache: string | null = null

function getClassifyPrompt(): string {
  if (!classifyPromptCache) {
    classifyPromptCache = readFileSync(join(process.cwd(), 'src/prompts/classify.md'), 'utf-8')
  }
  return classifyPromptCache
}

export function buildClassificationMessages(
  description: string,
  clarifications?: ClarificationAnswer[]
): { system: string; userMessage: string } {
  const system = getClassifyPrompt()
  let userMessage = `Task description: "${description}"`
  if (clarifications?.length) {
    userMessage += '\n\nClarification answers:\n'
    for (const c of clarifications) {
      userMessage += `- ${c.question}: ${c.answer}\n`
    }
  }
  return { system, userMessage }
}

// Phase 7.1: tool-use replaces raw JSON parsing. Two prior prompts crashed on
// `JSON.parse(rawText.replace(/```/g, ''))` because Haiku occasionally wraps
// the JSON in prose. Forcing a tool call eliminates the parse step entirely
// — the SDK returns a typed `input` object that matches our schema.
//
// Kept for tests and any legacy callers that still receive raw model text.
export function parseClassificationResponse(raw: string): Classification {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as Classification
}

// JSONSchema description of the Classification interface, given to Anthropic
// as a tool. Forcing tool_choice to this tool removes the need for prose
// parsing — see comment above parseClassificationResponse.
export const CLASSIFY_TOOL = {
  name: 'classify_task',
  description: 'Return the structured classification of the user task.',
  input_schema: {
    type: 'object' as const,
    properties: {
      // v0.9: thirteen canonical task types. Keep in sync with ALL_TASK_TYPES
      // in src/lib/registry.ts and the prose enum in src/prompts/classify.md.
      // This list was stuck on v0.7 (drive-by fix as part of phase 5) — the
      // markdown prompt had been updated through v0.8 + v0.9 but this
      // structured-output schema was missed, which meant some classifier
      // responses would have been silently coerced to 'other' by the API.
      task_type: {
        type: 'string',
        enum: [
          'summarise', 'extract', 'generate', 'comms', 'code', 'math',
          'reasoning', 'analyse', 'research', 'qa', 'translate',
          'conversation', 'embedding',
        ],
      },
      task_subtype: { type: ['string', 'null'] },
      complexity: { type: 'string', enum: ['simple', 'moderate', 'complex'] },
      input_length: { type: 'string', enum: ['short', 'medium', 'long', 'very_long'] },
      needs_vision: { type: 'boolean' },
      needs_tools: { type: 'boolean' },
      needs_code: { type: 'boolean' },
      needs_reasoning: { type: 'boolean' },
      is_recurring: { type: 'boolean' },
      data_sensitivity: { type: 'string', enum: ['none', 'pii', 'regulated_health', 'regulated_finance', 'on_prem_required'] },
      latency_target: { type: 'string', enum: ['realtime', 'interactive', 'batch'] },
      volume: { type: 'string', enum: ['one_off', 'hundreds_per_day', 'thousands_per_day', 'millions_per_day'] },
      needs_long_context: { type: 'boolean' },
      needs_multilingual: { type: 'boolean' },
      is_agentic: { type: 'boolean' },
      output_length: { type: 'string', enum: ['short', 'medium', 'long', 'very_long'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      clarification_needed: { type: 'boolean' },
      suggested_questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
          },
          required: ['question', 'options'],
        },
      },
      pipeline_recommended: { type: 'boolean' },
      pipeline_stages: {
        type: ['array', 'null'],
        items: {
          type: 'object',
          properties: {
            stage: { type: 'number' },
            // Same v0.9 enum as the top-level task_type above. Constraining
            // pipeline stages too keeps embedding pipelines (extract →
            // embedding → qa) parseable end-to-end.
            task_type: {
              type: 'string',
              enum: [
                'summarise', 'extract', 'generate', 'comms', 'code', 'math',
                'reasoning', 'analyse', 'research', 'qa', 'translate',
                'conversation', 'embedding',
              ],
            },
            description: { type: 'string' },
            requires_capabilities: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['vision', 'tools', 'code', 'long_context', 'extended_thinking', 'structured_output', 'multilingual', 'audio', 'video', 'computer_use'],
              },
            },
            input_length: { type: 'string', enum: ['short', 'medium', 'long', 'very_long'] },
            output_length: { type: 'string', enum: ['short', 'medium', 'long', 'very_long'] },
            needs_reasoning: { type: 'boolean' },
          },
          required: ['stage', 'task_type', 'description', 'requires_capabilities'],
        },
      },
    },
    required: [
      'task_type', 'complexity', 'input_length',
      'needs_vision', 'needs_tools', 'needs_code',
      'confidence', 'clarification_needed', 'suggested_questions',
    ],
  },
}

export async function classifyTask(
  description: string,
  clarifications?: ClarificationAnswer[]
): Promise<Classification> {
  const client = new Anthropic()
  const { system, userMessage } = buildClassificationMessages(description, clarifications)

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: userMessage }],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: 'tool', name: 'classify_task' },
  })

  const toolUse = response.content.find(block => block.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Classifier did not return a tool_use block')
  }
  return toolUse.input as Classification
}
