import { describe, expect, it } from 'vitest'
import { taskRelativeCapabilityScore } from '../capability-fit'
import type { Capability } from '../registry'

function model(capabilities: Capability[]) {
  return { capabilities }
}

describe('taskRelativeCapabilityScore', () => {
  it('is neutral when the task has no optional capability signals', () => {
    expect(taskRelativeCapabilityScore(model([]), {})).toBe(1)
    expect(taskRelativeCapabilityScore(model(['audio', 'video', 'vision']), {})).toBe(1)
  })

  it('does not reward unrelated capabilities', () => {
    const plain = taskRelativeCapabilityScore(model([]), { needsReasoning: true })
    const unrelated = taskRelativeCapabilityScore(
      model(['audio', 'video', 'vision']),
      { needsReasoning: true },
    )

    expect(unrelated).toBe(plain)
  })

  it('gives a small contextual advantage for a useful optional capability', () => {
    const withoutReasoning = taskRelativeCapabilityScore(model([]), { needsReasoning: true })
    const withReasoning = taskRelativeCapabilityScore(
      model(['extended_thinking']),
      { needsReasoning: true },
    )

    expect(withoutReasoning).toBeCloseTo(0.85, 6)
    expect(withReasoning).toBe(1)
  })

  it('treats extended thinking as relevant for complex work', () => {
    const withoutThinking = taskRelativeCapabilityScore(model([]), { complexity: 'complex' })
    const withThinking = taskRelativeCapabilityScore(
      model(['extended_thinking']),
      { complexity: 'complex' },
    )

    expect(withoutThinking).toBeCloseTo(0.85, 6)
    expect(withThinking).toBe(1)
  })

  it('does not double-reward a capability that is already required', () => {
    const toolsOnly = taskRelativeCapabilityScore(
      model(['tools']),
      { needsTools: true, isAgentic: true },
    )
    const toolsPlusUsefulAgenticCapabilities = taskRelativeCapabilityScore(
      model(['tools', 'extended_thinking', 'structured_output']),
      { needsTools: true, isAgentic: true },
    )

    expect(toolsOnly).toBeCloseTo(0.85, 6)
    expect(toolsPlusUsefulAgenticCapabilities).toBe(1)
  })
})
