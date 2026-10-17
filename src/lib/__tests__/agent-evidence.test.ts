import { describe, expect, it } from 'vitest'
import { AGENT_DIMENSIONS, agentDimensionScore, validateAgentProfile, type AgentProfile } from '../agent-evidence'
import { ALL_TASK_TYPES, TASK_TYPE_LABELS } from '../registry'

describe('agentic evidence foundations', () => {
  it('exposes agentic as a canonical task', () => {
    expect(ALL_TASK_TYPES).toContain('agentic')
    expect(TASK_TYPE_LABELS.agentic).toContain('agentic')
  })
  it('preserves missing evidence as unknown', () => {
    const profile: AgentProfile = { schema_version: '1', model_slug: 'example', workflow: 'coding_agent', evidence: [] }
    expect(validateAgentProfile(profile)).toBe(profile)
    for (const dimension of AGENT_DIMENSIONS) expect(agentDimensionScore(profile, dimension)).toBeNull()
  })
  it('rejects fabricated or invalid grades', () => {
    const profile: AgentProfile = { schema_version: '1', model_slug: 'example', workflow: 'coding_agent', evidence: [{
      dimension: 'tool_use', score: 1.5, source: 'test', benchmark: 'test',
      snapshot_date: '2026-10-10', methodology: 'test', harness: null, sample_size: null, confidence: 'low',
    }] }
    expect(() => validateAgentProfile(profile)).toThrow('Invalid agent score')
  })
})
