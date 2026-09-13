import { describe, expect, it } from 'vitest'
import type { ModelForVerification } from '@/db/model-verification'
import type { OpenRouterModel } from '@/lib/openrouter'
import { assessOpenRouterCatalogue } from '@/lib/catalogue-verification'

function bearingModel(overrides: Partial<ModelForVerification> = {}): ModelForVerification {
  return {
    slug: 'example-model',
    name: 'Example Model',
    provider: 'Example',
    active: true,
    openrouterId: 'example/model',
    pricing: { input_per_1m: 1, output_per_1m: 4 },
    contextWindow: 128_000,
    capabilities: ['tools', 'code', 'multilingual', 'long_context'],
    last_verified_at: null,
    verification_status: 'unknown',
    verification_source: null,
    verification_note: null,
    ...overrides,
  }
}

function openRouterModel(overrides: Partial<OpenRouterModel> = {}): OpenRouterModel {
  return {
    id: 'example/model',
    name: 'Example Model',
    description: null,
    context_length: 128_000,
    architecture: {
      modality: 'text->text',
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    pricing: { prompt: '0.000001', completion: '0.000004' },
    top_provider: { context_length: 128_000, max_completion_tokens: null },
    supported_parameters: ['tools'],
    created: 1,
    ...overrides,
  }
}

const verifiedAt = new Date('2026-09-13T08:00:00.000Z')

describe('assessOpenRouterCatalogue', () => {
  it('marks a mapped model current when observable metadata still agrees', () => {
    const report = assessOpenRouterCatalogue(
      [bearingModel()],
      [openRouterModel()],
      verifiedAt,
    )

    expect(report.current).toBe(1)
    expect(report.attention).toBe(0)
    expect(report.unavailable).toBe(0)
    expect(report.observations[0]).toMatchObject({
      slug: 'example-model',
      status: 'current',
      source: 'openrouter',
      note: null,
      verifiedAt: verifiedAt.toISOString(),
    })
  })

  it('does not treat curated capabilities that OpenRouter cannot observe as drift', () => {
    const report = assessOpenRouterCatalogue(
      [bearingModel({ capabilities: ['tools', 'code', 'multilingual', 'long_context'] })],
      [openRouterModel()],
      verifiedAt,
    )

    expect(report.current).toBe(1)
    expect(report.attention).toBe(0)
  })

  it('flags pricing, context and observable capability changes for review', () => {
    const report = assessOpenRouterCatalogue(
      [bearingModel()],
      [openRouterModel({
        context_length: 200_000,
        pricing: { prompt: '0.000002', completion: '0.000005' },
        supported_parameters: ['tools', 'structured_outputs', 'reasoning'],
      })],
      verifiedAt,
    )

    expect(report.attention).toBe(1)
    expect(report.current).toBe(0)
    expect(report.observations[0].status).toBe('attention')
    expect(report.observations[0].note).toContain('input price')
    expect(report.observations[0].note).toContain('output price')
    expect(report.observations[0].note).toContain('context')
    expect(report.observations[0].note).toContain('capabilities added')
  })

  it('marks a mapped active model unavailable when its OpenRouter id disappears', () => {
    const report = assessOpenRouterCatalogue([bearingModel()], [], verifiedAt)

    expect(report.unavailable).toBe(1)
    expect(report.observations[0]).toMatchObject({
      status: 'unavailable',
      source: 'openrouter',
    })
  })

  it('counts active unmapped models without overwriting their existing verification state', () => {
    const report = assessOpenRouterCatalogue(
      [bearingModel({ openrouterId: null })],
      [openRouterModel()],
      verifiedAt,
    )

    expect(report.unmapped).toBe(1)
    expect(report.checked).toBe(0)
    expect(report.observations).toHaveLength(0)
  })

  it('does not count ids already attached to inactive drafts as new candidates', () => {
    const report = assessOpenRouterCatalogue(
      [bearingModel({ active: false })],
      [openRouterModel()],
      verifiedAt,
    )

    expect(report.checked).toBe(0)
    expect(report.newCandidates).toBe(0)
  })
})
