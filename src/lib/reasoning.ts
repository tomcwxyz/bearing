import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ScoredModel } from './scoring'

let reasonPromptCache: string | null = null

function getReasonPrompt(): string {
  if (!reasonPromptCache) {
    reasonPromptCache = readFileSync(join(process.cwd(), 'src/prompts/reason.md'), 'utf-8')
  }
  return reasonPromptCache
}

export async function generateReasoning(
  taskDescription: string,
  taskType: string,
  models: ScoredModel[]
): Promise<Record<string, string>> {
  const client = new Anthropic()

  const modelSummaries = models.slice(0, 10).map((m, i) => ({
    rank: i + 1,
    slug: m.slug,
    name: m.name,
    provider: m.provider,
    weightedScore: m.weightedScore.toFixed(3),
    topFactors: Object.entries(m.factorScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([f, s]) => `${f}: ${s.toFixed(2)}`),
    estimatedCost: `$${m.estimatedCost.toFixed(4)}`,
  }))

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: getReasonPrompt(),
    messages: [
      {
        role: 'user',
        content: `Task: "${taskDescription}" (classified as: ${taskType})\n\nModels:\n${JSON.stringify(modelSummaries, null, 2)}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed: { slug: string; reasoning: string }[] = JSON.parse(cleaned)

  const map: Record<string, string> = {}
  for (const item of parsed) {
    map[item.slug] = item.reasoning
  }
  return map
}
