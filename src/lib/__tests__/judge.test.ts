import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the args passed to messages.create and control its return value.
const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
  },
}))

import { judgeResponses, JUDGE_MODEL } from '../judge'

function verdict(input: { winner: string; ranking: string[]; reason: string }) {
  return { content: [{ type: 'tool_use', name: 'submit_verdict', input }] }
}

describe('judgeResponses', () => {
  beforeEach(() => createMock.mockReset())

  it('maps anonymous labels back to candidate ids', async () => {
    createMock.mockResolvedValue(verdict({ winner: 'B', ranking: ['B', 'A', 'C'], reason: 'B was correct' }))
    const result = await judgeResponses('what is 2+2?', [
      { id: 'model-a', text: 'five' },
      { id: 'model-b', text: 'four' },
      { id: 'model-c', text: 'maybe four' },
    ])
    expect(result.winnerId).toBe('model-b')
    expect(result.rankingIds).toEqual(['model-b', 'model-a', 'model-c'])
    expect(result.reason).toBe('B was correct')
    expect(result.judgeModel).toBe(JUDGE_MODEL)
  })

  it('presents answers blind — labelled A/B/C, no candidate ids leaked to the model', async () => {
    createMock.mockResolvedValue(verdict({ winner: 'A', ranking: ['A', 'B'], reason: 'ok' }))
    await judgeResponses('prompt', [
      { id: 'secret-slug-1', text: 'answer one' },
      { id: 'secret-slug-2', text: 'answer two' },
    ])
    const sentUser = createMock.mock.calls[0][0].messages[0].content as string
    expect(sentUser).toContain('Answer A')
    expect(sentUser).toContain('Answer B')
    expect(sentUser).toContain('answer one')
    expect(sentUser).not.toContain('secret-slug-1')
    expect(sentUser).not.toContain('secret-slug-2')
  })

  it('drops unknown labels from the ranking defensively', async () => {
    createMock.mockResolvedValue(verdict({ winner: 'A', ranking: ['A', 'Z', 'B'], reason: 'ok' }))
    const result = await judgeResponses('prompt', [
      { id: 'x', text: 'one' },
      { id: 'y', text: 'two' },
    ])
    expect(result.rankingIds).toEqual(['x', 'y'])
  })

  it('throws when the winner label is unknown', async () => {
    createMock.mockResolvedValue(verdict({ winner: 'Z', ranking: ['Z'], reason: 'ok' }))
    await expect(
      judgeResponses('prompt', [{ id: 'x', text: 'one' }, { id: 'y', text: 'two' }]),
    ).rejects.toThrow(/unknown winner/)
  })

  it('requires at least two candidates', async () => {
    await expect(judgeResponses('prompt', [{ id: 'x', text: 'one' }])).rejects.toThrow(/at least two/)
    expect(createMock).not.toHaveBeenCalled()
  })
})
