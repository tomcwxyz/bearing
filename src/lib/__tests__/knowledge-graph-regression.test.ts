import { describe, expect, it } from 'vitest'
import { scoreModelsDetailed } from '../scoring'
import type { Factor } from '../registry'

const priorities: Factor[] = ['capability','quality','cost','privacy','speed','transparency','sustainability']
const base = {
  taskType: 'embedding',
  complexity: 'complex',
  inputLength: 'very_long',
  needsVision: false,
  needsTools: true,
  needsCode: true,
  needsLongContext: true,
  isAgentic: true,
  priorityOrder: priorities,
}

describe('knowledge graph mixed workload regression', () => {
  it('does not exclude every embedding candidate because upstream stages use tools and code', () => {
    const { models, excluded } = scoreModelsDetailed(base)
    expect(models.length).toBeGreaterThan(0)
    expect(models.every(m => !m.capabilities.includes('tools'))).toBe(true)
    expect(excluded.filter(e => e.reason === 'missing_tools')).toHaveLength(0)
  })

  it('can rank chat models for the main knowledge graph analysis task', () => {
    const { models } = scoreModelsDetailed({...base,taskType:'analyse'})
    expect(models.length).toBeGreaterThan(0)
  })
})
