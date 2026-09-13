import { describe, expect, it } from 'vitest'
import { classifyProbeFailure } from '../routability-canary'

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
