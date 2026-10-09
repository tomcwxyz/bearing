import { describe, expect, it } from 'vitest'
import { contributorDemoEnabled, isContributorDemoMode } from '@/lib/contributor-demo-mode'
import { DEMO_SCENARIOS, DEMO_FOCUS, runContributorDemo, type DemoRequest } from '@/lib/contributor-fixtures'
import { getAllModels } from '@/lib/registry'

const sample: DemoRequest = { scenarioId: 'summary', focus: 'balanced', onPremOnly: false }

describe('local contribution workbench', () => {
  it('requires an explicit development-only flag', () => {
    expect(isContributorDemoMode({ nodeEnv: 'development', flag: '1' })).toBe(true)
    expect(isContributorDemoMode({ nodeEnv: 'production', flag: '1' })).toBe(false)
    expect(isContributorDemoMode({ nodeEnv: 'development' })).toBe(false)
    expect(typeof contributorDemoEnabled()).toBe('boolean')
  })

  it('ships well-formed synthetic tasks and complete priority permutations', () => {
    expect(new Set(DEMO_SCENARIOS.map(s => s.id)).size).toBe(DEMO_SCENARIOS.length)
    expect(DEMO_SCENARIOS.length).toBeGreaterThanOrEqual(4)
    for (const focus of Object.values(DEMO_FOCUS)) {
      expect(focus.priorities).toHaveLength(7)
      expect(new Set(focus.priorities).size).toBe(7)
    }
  })

  it('scores a task without a database and maintains rank ordering', () => {
    const result = runContributorDemo(sample)
    expect(result.modelCount).toBeGreaterThan(0)
    expect(result.eligibleCount + result.excludedCount).toBe(result.modelCount)
    expect(result.models.length).toBeGreaterThan(0)
    for (let i = 1; i < result.models.length; i++) {
      expect(result.models[i - 1].weightedScore).toBeGreaterThanOrEqual(result.models[i].weightedScore)
    }
  })

  it('enforces the embedding model-class gate', () => {
    const result = runContributorDemo({ ...sample, scenarioId: 'embedding' })
    const catalogue = getAllModels()
    expect(result.models.length).toBeGreaterThan(0)
    expect(result.models.every(m => catalogue.find(c => c.slug === m.slug)?.model_class === 'embedding')).toBe(true)
    expect(result.excludedByReason.wrong_class).toBeGreaterThan(0)
  })

  it('changes weights and enforces local-only filtering', () => {
    const cost = runContributorDemo({ ...sample, focus: 'cost' })
    const quality = runContributorDemo({ ...sample, focus: 'quality' })
    expect(cost.effectiveWeights.cost).toBeGreaterThan(quality.effectiveWeights.cost)
    const restricted = runContributorDemo({ ...sample, onPremOnly: true })
    const localSlugs = new Set(getAllModels().filter(m => m.local_info).map(m => m.slug))
    expect(restricted.eligibleCount).toBeLessThanOrEqual(cost.eligibleCount)
    expect(restricted.excludedByReason.on_prem_required).toBeGreaterThan(0)
    expect(restricted.models.every(m => localSlugs.has(m.slug))).toBe(true)
  })

  it('rejects invalid scenario data', () => {
    expect(() => runContributorDemo({ ...sample, scenarioId: 'not-real' as DemoRequest['scenarioId'] })).toThrow()
  })
})
