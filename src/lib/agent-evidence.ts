/**
 * Agentic performance is evidence, not a guessed extension of general reasoning.
 * Null means no comparable observation, never a zero score.
 */
export const AGENT_DIMENSIONS = [
  'tool_use', 'multi_step_execution', 'recovery',
  'context_management', 'instruction_adherence', 'completion_judgement',
] as const
export type AgentDimension = typeof AGENT_DIMENSIONS[number]
export type AgentWorkflow = 'tool_assistant' | 'coding_agent' | 'research_agent' | 'long_running'
export interface AgentEvidence {
  dimension: AgentDimension
  score: number | null
  source: string
  benchmark: string
  snapshot_date: string
  methodology: string
  harness: string | null
  sample_size: number | null
  confidence: 'low' | 'medium' | 'high'
}
export interface AgentProfile {
  schema_version: '1'
  model_slug: string
  workflow: AgentWorkflow
  evidence: AgentEvidence[]
}
export function validateAgentProfile(value: AgentProfile): AgentProfile {
  if (value.schema_version !== '1' || !value.model_slug) throw new Error('Invalid agent profile')
  for (const row of value.evidence) {
    if (!AGENT_DIMENSIONS.includes(row.dimension)) throw new Error('Unknown agent dimension')
    if (row.score !== null && (!Number.isFinite(row.score) || row.score < 0 || row.score > 1)) throw new Error('Invalid agent score')
    if (!row.source || !row.benchmark || !row.snapshot_date || !row.methodology) throw new Error('Agent evidence requires provenance')
  }
  return value
}
export function agentDimensionScore(profile: AgentProfile, dimension: AgentDimension): number | null {
  const observations = profile.evidence.filter(e => e.dimension === dimension && e.score !== null)
  if (!observations.length) return null
  return observations.reduce((sum, row) => sum + (row.score ?? 0), 0) / observations.length
}
