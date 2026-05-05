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

export function parseClassificationResponse(raw: string): Classification {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as Classification
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
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return parseClassificationResponse(text)
}
