import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

// Model used to judge candidate answers. Sonnet is a deliberate step up from the
// Haiku classifier: judging answer quality is harder than tagging a task, and
// the judge's verdict becomes published preference data, so accuracy matters.
export const JUDGE_MODEL = 'claude-sonnet-4-6'

export interface JudgeCandidate {
  /** Stable identifier (e.g. model slug) — NOT shown to the judge. */
  id: string
  /** The answer text to be judged. */
  text: string
}

export interface JudgeVerdict {
  /** id of the winning candidate. */
  winnerId: string
  /** All candidate ids, best to worst. */
  rankingIds: string[]
  /** One-sentence rationale. */
  reason: string
  /** Which model produced the verdict. */
  judgeModel: string
}

let judgePromptCache: string | null = null
function getJudgePrompt(): string {
  if (!judgePromptCache) {
    judgePromptCache = readFileSync(join(process.cwd(), 'src/prompts/judge.md'), 'utf-8')
  }
  return judgePromptCache
}

// A..Z labels. Trio uses 3, but the judge generalises to any small panel.
const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const JUDGE_TOOL = {
  name: 'submit_verdict',
  description: 'Return the blind judgement of the candidate answers.',
  input_schema: {
    type: 'object' as const,
    properties: {
      winner: { type: 'string', description: 'Label of the best answer, e.g. "A"' },
      ranking: {
        type: 'array',
        items: { type: 'string' },
        description: 'All labels, best to worst',
      },
      reason: { type: 'string', description: 'One sentence, under 30 words' },
    },
    required: ['winner', 'ranking', 'reason'],
  },
}

/**
 * Blind-judge a set of candidate answers to a prompt.
 *
 * Candidates are presented to the judge under anonymous labels (A, B, C …) in
 * the order given, so the model cannot infer which AI produced which answer.
 * We map the labels back to candidate ids before returning. The caller is
 * responsible for shuffling candidates if it wants to remove positional bias.
 */
export async function judgeResponses(
  prompt: string,
  candidates: JudgeCandidate[],
): Promise<JudgeVerdict> {
  if (candidates.length < 2) {
    throw new Error('judgeResponses needs at least two candidates')
  }
  if (candidates.length > LABELS.length) {
    throw new Error('judgeResponses supports at most 26 candidates')
  }

  const labelToId = new Map<string, string>()
  let userMessage = `User's prompt:\n"""\n${prompt}\n"""\n\nCandidate answers:\n`
  candidates.forEach((c, i) => {
    const label = LABELS[i]
    labelToId.set(label, c.id)
    userMessage += `\n--- Answer ${label} ---\n${c.text}\n`
  })

  const client = new Anthropic()
  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 512,
    system: getJudgePrompt(),
    messages: [{ role: 'user', content: userMessage }],
    tools: [JUDGE_TOOL],
    tool_choice: { type: 'tool', name: 'submit_verdict' },
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Judge did not return a tool_use block')
  }
  const out = toolUse.input as { winner: string; ranking: string[]; reason: string }

  const winnerId = labelToId.get(out.winner)
  if (!winnerId) {
    throw new Error(`Judge returned unknown winner label "${out.winner}"`)
  }
  // De-anonymise the ranking, dropping any stray/unknown labels defensively.
  const rankingIds = out.ranking
    .map((label) => labelToId.get(label))
    .filter((id): id is string => Boolean(id))

  return { winnerId, rankingIds, reason: out.reason, judgeModel: JUDGE_MODEL }
}
