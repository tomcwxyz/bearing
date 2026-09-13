import { describe, expect, it } from 'vitest'
import type { ModelForVerification } from '@/db/model-verification'
import type { OpenRouterModel } from '@/lib/openrouter'
import type { ProviderCatalogueSnapshot } from '@/lib/provider-catalogue'
import {
  buildCatalogueDriftPatch,
  buildCatalogueDriftReview,
} from '@/lib/catalogue-drift'

function bearingModel(overrides: Partial<ModelForVerification> = {}): ModelForVerification {
  return {
    slug: 'example-model',
    name: 'Example Model',
    provider: 'Example',
    active: true,
    openrouterId: 'example/model',
    providerModelId: null,
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

describe('buildCatalogueDriftReview', () => {
  it('builds independent pricing and context proposals from OpenRouter', () => {
    const items = buildCatalogueDriftReview(
      [bearingModel()],
      [openRouterModel({
        context_length: 200_000,
        pricing: { prompt: '0.000002', completion: '0.000005' },
      })],
      [],
    )

    expect(items).toHaveLength(1)
    expect(items[0].changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'input_price', before: 1, after: 2 }),
      expect.objectContaining({ field: 'output_price', before: 4, after: 5 }),
      expect.objectContaining({ field: 'context_window', before: 128_000, after: 200_000 }),
    ]))
  })

  it('prefers provider-native context over OpenRouter context', () => {
    const provider: ProviderCatalogueSnapshot = {
      provider: 'Example',
      source: 'provider:example',
      models: [{ id: 'provider-model', contextWindow: 300_000 }],
    }
    const items = buildCatalogueDriftReview(
      [bearingModel({ providerModelId: 'provider-model' })],
      [openRouterModel({ context_length: 200_000 })],
      [provider],
    )

    expect(items[0].changes).toContainEqual({
      field: 'context_window',
      before: 128_000,
      after: 300_000,
      source: 'provider:example',
    })
  })

  it('merges observable capability evidence without deleting curated capabilities', () => {
    const provider: ProviderCatalogueSnapshot = {
      provider: 'Example',
      source: 'provider:example',
      models: [{
        id: 'provider-model',
        capabilities: { vision: true, tools: false },
      }],
    }
    const items = buildCatalogueDriftReview(
      [bearingModel({ providerModelId: 'provider-model' })],
      [openRouterModel({
        supported_parameters: ['tools', 'structured_outputs'],
        architecture: {
          modality: 'text+image->text',
          input_modalities: ['text', 'image'],
          output_modalities: ['text'],
        },
      })],
      [provider],
    )

    const capability = items[0].changes.find((change) => change.field === 'capabilities')
    expect(capability?.field).toBe('capabilities')
    if (capability?.field !== 'capabilities') throw new Error('Expected capability drift')
    expect(capability.after).toContain('code')
    expect(capability.after).toContain('multilingual')
    expect(capability.after).toContain('vision')
    expect(capability.after).toContain('structured_output')
    expect(capability.after).not.toContain('tools')
    expect(capability.source).toBe('provider:example')
  })

  it('surfaces provider disappearance as a manual availability concern', () => {
    const provider: ProviderCatalogueSnapshot = {
      provider: 'Example',
      source: 'provider:example',
      models: [],
    }
    const items = buildCatalogueDriftReview(
      [bearingModel({ providerModelId: 'provider-model' })],
      [openRouterModel()],
      [provider],
    )

    expect(items[0].availabilityConcern).toMatchObject({ source: 'provider:example' })
    expect(items[0].availabilityConcern?.message).toContain('not an automatic')
  })
})

describe('buildCatalogueDriftPatch', () => {
  it('applies only selected fields while preserving the other half of pricing', () => {
    const model = bearingModel()
    const item = buildCatalogueDriftReview(
      [model],
      [openRouterModel({
        context_length: 200_000,
        pricing: { prompt: '0.000002', completion: '0.000005' },
      })],
      [],
    )[0]

    const patch = buildCatalogueDriftPatch(model, item, ['input_price', 'context_window'])
    expect(patch.pricing).toEqual({ input_per_1m: 2, output_per_1m: 4 })
    expect(patch.contextWindow).toBe(200_000)
    expect(patch.capabilities).toBeUndefined()
  })
})
