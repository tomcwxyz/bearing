import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callOllamaCloud,
  fetchReviewedOllamaCloudAvailability,
  getOllamaCloudRoute,
  ollamaCloudPricing,
} from '../ollama-cloud'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Ollama Cloud routes', () => {
  it('keeps route pricing separate from canonical model pricing', () => {
    const route = getOllamaCloudRoute('qwen3.5-397b')
    expect(route?.modelId).toBe('qwen3.5:397b')
    expect(route?.pricing).toEqual({
      input_per_1m: 0.6,
      output_per_1m: 3.6,
    })
  })

  it('applies reviewed peak pricing only inside the configured UTC window', () => {
    const route = getOllamaCloudRoute('deepseek-v4-pro')
    expect(route).not.toBeNull()

    expect(ollamaCloudPricing(route!, new Date('2026-09-22T13:00:00Z'))).toEqual({
      input_per_1m: 1.32,
      output_per_1m: 3.96,
    })
    expect(ollamaCloudPricing(route!, new Date('2026-09-22T08:00:00Z'))).toEqual({
      input_per_1m: 0.66,
      output_per_1m: 1.98,
    })
    expect(ollamaCloudPricing(route!, new Date('2026-09-20T13:00:00Z'))).toEqual({
      input_per_1m: 0.66,
      output_per_1m: 1.98,
    })
  })

  it('checks reviewed routes against the public Ollama cloud catalogue', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      models: [
        { name: 'glm-5.2', model: 'glm-5.2' },
        { name: 'qwen3.5:397b', model: 'qwen3.5:397b' },
      ],
    }), { status: 200 }))

    const results = await fetchReviewedOllamaCloudAvailability(fetchImpl as typeof fetch)
    expect(results.find((item) => item.route.slug === 'glm-5.2')?.available).toBe(true)
    expect(results.find((item) => item.route.slug === 'qwen3.5-397b')?.available).toBe(true)
    expect(results.find((item) => item.route.slug === 'kimi-k3')?.available).toBe(false)
  })

  it('calls Ollama Cloud directly with bearer auth and captures runtime metrics', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key')
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer test-key')
      const body = JSON.parse(String(init?.body ?? '{}'))
      expect(body.model).toBe('qwen3.5:397b')
      expect(body.stream).toBe(false)

      return new Response(JSON.stringify({
        model: 'qwen3.5:397b',
        message: { content: 'Cloud answer' },
        prompt_eval_count: 100,
        eval_count: 50,
        eval_duration: 1_000_000_000,
        total_duration: 2_000_000_000,
        load_duration: 100_000_000,
        prompt_eval_duration: 500_000_000,
      }), { status: 200 })
    })

    const result = await callOllamaCloud(
      'qwen3.5-397b',
      [{ role: 'user', content: 'Hello cloud' }],
      { fetchImpl: fetchImpl as typeof fetch },
    )

    expect(result).toMatchObject({
      text: 'Cloud answer',
      runtimeModelId: 'qwen3.5:397b',
      promptTokens: 100,
      outputTokens: 50,
      tokensPerSecond: 50,
      totalDurationMs: 2000,
      loadDurationMs: 100,
      promptEvalDurationMs: 500,
    })
  })

  it('does not pretend multimodal Bearing messages are supported by the cloud adapter yet', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key')
    const result = await callOllamaCloud('qwen3.5-397b', [{
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
    }])

    expect(result.error).toContain('file or multimodal')
  })
})
