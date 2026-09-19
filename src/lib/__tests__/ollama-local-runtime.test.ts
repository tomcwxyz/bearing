import { describe, expect, it, vi } from 'vitest'
import {
  probeLocalOllama,
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
})
