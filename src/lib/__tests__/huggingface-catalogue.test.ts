import { describe, expect, it, vi } from 'vitest'
import {
  deriveHuggingFaceOpenEvidence,
  fetchHuggingFaceModelInfo,
  fetchHuggingFaceRouterModels,
} from '../huggingface-catalogue'

describe('Hugging Face catalogue adapter', () => {
  it('derives open-model evidence without treating provider availability as intrinsic quality', () => {
    const evidence = deriveHuggingFaceOpenEvidence({
      id: 'example/model',
      sha: 'abc123',
      lastModified: '2026-09-19T00:00:00Z',
      cardData: { license: 'apache-2.0' },
      safetensors: { parameters: { BF16: 9_000_000_000 } },
      gguf: { total: 1 },
      inference: 'warm',
      inferenceProviderMapping: {
        providerA: { status: 'live', providerId: 'example/model' },
        providerB: { status: 'staging', providerId: 'example/model-beta' },
      },
    })

    expect(evidence.licenceIds).toEqual(['apache-2.0'])
    expect(evidence.parameterCount).toBe(9_000_000_000)
    expect(evidence.liveProviders).toEqual(['providerA'])
    expect(evidence.hasGgufMetadata).toBe(true)
  })

  it('requests expanded model evidence from the Hub API', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
      id: 'google/gemma-test',
    }), { status: 200 }))

    await fetchHuggingFaceModelInfo('google/gemma-test', { fetchImpl: fetchImpl as typeof fetch })

    const url = String(fetchImpl.mock.calls[0][0])
    expect(url).toContain('/api/models/google/gemma-test?')
    expect(url).toContain('expand=gguf')
    expect(url).toContain('expand=safetensors')
    expect(url).toContain('expand=inferenceProviderMapping')
  })

  it('reads current router provider evidence', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
      data: [{
        id: 'Qwen/example',
        providers: [{
          provider: 'test-provider',
          status: 'live',
          supports_tools: true,
          throughput: 42,
        }],
      }],
    }), { status: 200 }))

    const models = await fetchHuggingFaceRouterModels({ fetchImpl: fetchImpl as typeof fetch })
    expect(models[0].providers?.[0].supports_tools).toBe(true)
    expect(models[0].providers?.[0].throughput).toBe(42)
  })
})
