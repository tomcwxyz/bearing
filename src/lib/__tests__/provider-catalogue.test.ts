import { describe, expect, it } from 'vitest'
import type { ModelForVerification } from '@/db/model-verification'
import { assessProviderCatalogue } from '../provider-catalogue'

function model(overrides: Partial<ModelForVerification> = {}): ModelForVerification {
  return {
    slug: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    provider: 'Anthropic',
    active: true,
    openrouterId: null,
    providerModelId: 'claude-sonnet-5',
    pricing: { input_per_1m: 2, output_per_1m: 10 },
    contextWindow: 1_000_000,
    capabilities: ['vision', 'structured_output', 'extended_thinking'],
    last_verified_at: null,
    verification_status: 'unknown',
    verification_source: null,
    verification_note: null,
    ...overrides,
  }
}

const now = new Date('2026-09-13T12:00:00Z')

describe('assessProviderCatalogue', () => {
  it('marks an explicitly mapped present model current', () => {
    const report = assessProviderCatalogue([model()], {
      provider: 'Anthropic',
      source: 'provider:anthropic',
      models: [{
        id: 'claude-sonnet-5',
        contextWindow: 1_000_000,
        capabilities: { vision: true, structured_output: true, extended_thinking: true },
      }],
    }, now)

    expect(report.checked).toBe(1)
    expect(report.current).toBe(1)
    expect(report.observations[0]).toMatchObject({
      slug: 'claude-sonnet-5',
      status: 'current',
      source: 'provider:anthropic',
    })
  })

  it('surfaces provider metadata drift for review', () => {
    const report = assessProviderCatalogue([model()], {
      provider: 'Anthropic',
      source: 'provider:anthropic',
      models: [{
        id: 'claude-sonnet-5',
        contextWindow: 200_000,
        capabilities: { vision: false },
      }],
    }, now)

    expect(report.attention).toBe(1)
    expect(report.observations[0].note).toContain('context 1,000,000 → 200,000 tokens')
    expect(report.observations[0].note).toContain('vision present → not supported')
  })

  it('marks a mapped model unavailable only after a successful provider snapshot', () => {
    const report = assessProviderCatalogue([model()], {
      provider: 'Anthropic',
      source: 'provider:anthropic',
      models: [],
    }, now)

    expect(report.unavailable).toBe(1)
    expect(report.observations[0].status).toBe('unavailable')
    expect(report.observations[0].note).toContain('not an automatic deactivation')
  })

  it('does not guess provider ids for unmapped models', () => {
    const report = assessProviderCatalogue([
      model({ providerModelId: null, slug: 'claude-fable-5' }),
    ], {
      provider: 'Anthropic',
      source: 'provider:anthropic',
      models: [{ id: 'claude-fable-5' }],
    }, now)

    expect(report.checked).toBe(0)
    expect(report.observations).toHaveLength(0)
  })

  it('only checks models belonging to the provider snapshot', () => {
    const report = assessProviderCatalogue([
      model(),
      model({ slug: 'gpt-5.6-sol', provider: 'OpenAI', providerModelId: 'gpt-5.6-sol' }),
    ], {
      provider: 'Anthropic',
      source: 'provider:anthropic',
      models: [{ id: 'claude-sonnet-5' }],
    }, now)

    expect(report.checked).toBe(1)
    expect(report.observations.map((o) => o.slug)).toEqual(['claude-sonnet-5'])
  })
})
