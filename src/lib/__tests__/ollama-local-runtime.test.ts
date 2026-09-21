import { describe, expect, it, vi } from 'vitest'
import {
  probeLocalOllama,
  runLocalOllama,
} from '../ollama-local-runtime'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('probeLocalOllama', () => {
  it('returns measured runtime evidence from Ollama', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/tags')) {
        return jsonResponse({
          models: [{
            name: 'qwen3.5:9b',
            model: 'qwen3.5:9b',
            details: { quantization_level: 'Q4_K_M' },
          }],
        })
      }
      if (url.endsWith('/api/version')) {
        return jsonResponse({ version: '0.32.15' })
      }
      if (url.endsWith('/api/chat')) {
        return jsonResponse({
          model: 'qwen3.5:9b',
          total_duration: 2_000_000_000,
          load_duration: 500_000_000,
          prompt_eval_count: 20,
          prompt_eval_duration: 100_000_000,
          eval_count: 30,
          eval_duration: 1_000_000_000,
        })
      }
      if (url.endsWith('/api/ps')) {
        return jsonResponse({
          models: [{
            name: 'qwen3.5:9b',
            model: 'qwen3.5:9b',
            size_vram: 6 * 1024 ** 3,
            context_length: 2048,
            details: { quantization_level: 'Q4_K_M' },
          }],
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const result = await probeLocalOllama('qwen3.5:9b', { fetchImpl })

    expect(result).toMatchObject({
      runtimeModelId: 'qwen3.5:9b',
      runtimeVersion: '0.32.15',
      quant: 'Q4_K_M',
      contextLength: 2048,
      measuredVramGb: 6,
      tokensPerSecond: 30,
      latencyMs: 2000,
      promptTokens: 20,
      outputTokens: 30,
      totalDurationMs: 2000,
      loadDurationMs: 500,
      promptEvalDurationMs: 100,
    })
  })

  it('does not auto-pull a missing model', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ models: [] }))

    await expect(
      probeLocalOllama('qwen3.5:9b', { fetchImpl }),
    ).rejects.toMatchObject({
      code: 'model_not_installed',
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reports an unreachable local daemon cleanly', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(
      probeLocalOllama('qwen3.5:9b', { fetchImpl }),
    ).rejects.toMatchObject({
      code: 'unreachable',
    })
  })

  it('verifies embedding models through the Ollama embed endpoint', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/tags')) {
        return jsonResponse({
          models: [{
            name: 'qwen3-embedding:4b',
            model: 'qwen3-embedding:4b',
            details: { quantization_level: 'Q4_K_M' },
          }],
        })
      }
      if (url.endsWith('/api/embed')) {
        return jsonResponse({
          model: 'qwen3-embedding:4b',
          embeddings: [[0.1, 0.2, 0.3]],
          total_duration: 500_000_000,
          prompt_eval_count: 4,
          prompt_eval_duration: 200_000_000,
        })
      }
      if (url.endsWith('/api/version')) return jsonResponse({ version: '0.32.15' })
      if (url.endsWith('/api/ps')) return jsonResponse({ models: [] })
      throw new Error(`Unexpected URL: ${url}`)
    })

    const result = await probeLocalOllama('qwen3-embedding:4b', {
      fetchImpl,
      kind: 'embedding',
    })

    expect(result).toMatchObject({
      runtimeModelId: 'qwen3-embedding:4b',
      runtimeVersion: '0.32.15',
      promptTokens: 4,
      tokensPerSecond: 20,
    })
    expect(fetchImpl.mock.calls.some(([input]) => String(input).endsWith('/api/embed'))).toBe(true)
  })

  it('runs a real prompt locally without changing the prompt text', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/tags')) {
        return jsonResponse({
          models: [{ name: 'qwen3.5:9b-q8_0', model: 'qwen3.5:9b-q8_0' }],
        })
      }
      if (url.endsWith('/api/chat')) {
        const body = JSON.parse(String(init?.body ?? '{}'))
        expect(body.messages[0].content).toBe('Keep this prompt local')
        return jsonResponse({
          model: 'qwen3.5:9b-q8_0',
          message: { content: 'Local answer' },
          total_duration: 1_000_000_000,
          eval_count: 10,
          eval_duration: 500_000_000,
        })
      }
      if (url.endsWith('/api/version')) return jsonResponse({ version: '0.32.15' })
      if (url.endsWith('/api/ps')) return jsonResponse({ models: [] })
      throw new Error(`Unexpected URL: ${url}`)
    })

    const result = await runLocalOllama('qwen3.5:9b', 'Keep this prompt local', { fetchImpl })

    expect(result.response).toBe('Local answer')
    expect(result.runtimeModelId).toBe('qwen3.5:9b-q8_0')
  })

})
