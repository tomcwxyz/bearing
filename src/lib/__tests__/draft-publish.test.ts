import { describe, expect, it } from 'vitest'
import { assessDraftReadiness } from '../draft-publish'
import type { AdminModel } from '@/db/models'

const draft = {
  name: 'Mistral Large 4', provider: 'Mistral', tier: 'flagship',
  context_window: 128000, model_class: 'chat',
  pricing: { input_per_1m: 2, output_per_1m: 8 },
  task_fitness: { code: 0.8 }, speed_score: 0.6, privacy_score: 0.5,
  capabilities: ['tools'],
} as unknown as AdminModel
const meta = { slug: 'mistral-large-4', openrouterId: 'mistralai/mistral-large-4', providerModelId: null, verificationStatus: 'unknown', benchmarkSources: [] }

describe('batch publication readiness', () => {
  it('allows missing benchmarks with explicit warnings', () => {
    const result = assessDraftReadiness(draft, meta)
    expect(result.ready).toBe(true)
    expect(result.warnings).toContain('No approved benchmark mapping')
  })
  it('does not block publishing merely because an external catalogue is unverified', () => {
    const result = assessDraftReadiness(draft, { ...meta, verificationStatus: 'unavailable' })
    expect(result.ready).toBe(true)
    expect(result.warnings).toContain('Catalogue verification reports unavailable')
  })
  it('blocks invalid pricing, contexts, scores and required fields', () => {
    const result = assessDraftReadiness({
      ...draft, name: ' ', context_window: 0,
      speed_score: Number.NaN, task_fitness: { code: 2 },
      pricing: { input_per_1m: -1, output_per_1m: Number.POSITIVE_INFINITY },
    }, meta)
    expect(result.ready).toBe(false)
    expect(result.blockers.length).toBeGreaterThanOrEqual(4)
  })
  it('remains publishable with missing routing ID but highlights the limitation', () => {
    const result = assessDraftReadiness(draft, { ...meta, openrouterId: null })
    expect(result.ready).toBe(true)
    expect(result.warnings).toContain('No model routing identifier')
  })
})
