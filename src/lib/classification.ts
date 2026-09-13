import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  CLASSIFY_TOOL,
  validateClassification,
  type Classification,
  type ClarificationAnswer,
} from './classification-schema'

export { CLASSIFY_TOOL, validateClassification }
export type { Classification, ClarificationAnswer }

let classifyPromptCache: string | null = null

function getClassifyPrompt(): string {
  if (!classifyPromptCache) {
    classifyPromptCache = readFileSync(join(process.cwd(), 'src/prompts/classify.md'), 'utf-8')
  }
  return classifyPromptCache
}

export function buildClassificationMessages(
  description: string,
  clarifications?: ClarificationAnswer[],
): { system: string; userMessage: string } {
  const system = getClassifyPrompt()
  let userMessage = `Task description: "${description}"`
  if (clarifications?.length) {
    userMessage += '\n\nClarification answers:\n'
    for (const clarification of clarifications) {
      userMessage += `- ${clarification.question}: ${clarification.answer}\n`
    }
  }
  return { system, userMessage }
}

// Kept for tests and any legacy callers that still receive raw model text. Raw
// JSON now passes through exactly the same runtime validator as tool-use output;
// parsing a JSON-shaped object is not enough to trust it as Classification.
export function parseClassificationResponse(raw: string): Classification {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return validateClassification(JSON.parse(cleaned) as unknown)
}

export async function classifyTask(
  description: string,
  clarifications?: ClarificationAnswer[],
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

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Classifier did not return a tool_use block')
  }

  return validateClassification(toolUse.input)
}
