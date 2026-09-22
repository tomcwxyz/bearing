import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyProbeFailure, probeOllamaCloudModel } from '../routability-canary'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('classifyProbeFailure', () => {
  it('marks an explicit missing model as unavailable', () => {
    const result = classifyProbeFailure(
      'openrouter-runtime',
      400,
      JSON.stringify({ error: { message: 'No endpoints found for this model; model is not available' } }),
    )

    expect(result.status).toBe('unavailable')
  })

  it('marks a 404 as unavailable', () => {
    const result = classifyProbeFailure('openrouter-runtime', 404, 'not found')
    expect(result.status).toBe('unavailable')
  })

  it('does not mistake rate limiting for model unavailability', () => {
    const result = classifyProbeFailure('openrouter-runtime', 429, 'rate limit exceeded')
    expect(result.status).toBe('degraded')
    expect(result.note).toContain('rate limited')
  })

  it('does not mistake provider 5xx responses for model unavailability', () => {
    const result = classifyProbeFailure('openrouter-runtime', 503, 'upstream unavailable')
    expect(result.status).toBe('degraded')
    expect(result.note).toContain('transient')
  })

  it('does not mistake authentication failures for model unavailability', () => {
    const result = classifyProbeFailure('openrouter-runtime', 401, 'invalid api key')
    expect(result.status).toBe('degraded')
    expect(result.note).toContain('not evidence')
  })

  it('treats an unknown request failure conservatively', () => {
    const result = classifyProbeFailure('direct-runtime', 400, 'unsupported parameter')
    expect(result.status).toBe('degraded')
  })
})


describe('probeOllamaCloudModel', () => {
  it('runs a minimal canary against the reviewed cloud model id', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key')
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer test-key')
      const body = JSON.parse(String(init?.body ?? '{}'))
      expect(body.model).toBe('glm-5.2')
      expect(body.options.num_predict).toBe(1)
      return new Response(JSON.stringify({
        model: 'glm-5.2',
        message: { content: 'OK' },
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchImpl)

    await expect(probeOllamaCloudModel('glm-5.2')).resolves.toMatchObject({
      status: 'healthy',
      source: 'ollama-cloud-runtime',
    })
  })

  it('treats a missing cloud key as degraded configuration, not model unavailability', async () => {
    vi.stubEnv('OLLAMA_API_KEY', '')
    await expect(probeOllamaCloudModel('glm-5.2')).resolves.toMatchObject({
      status: 'degraded',
      source: 'ollama-cloud-runtime',
    })
  })
})
