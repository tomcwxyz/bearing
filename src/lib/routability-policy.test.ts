import { describe, expect, it } from 'vitest'

import { isBlockingRoutabilityObservation } from './routability-policy'
import type { RoutabilitySummary } from '@/db/model-routability'

const NOW = new Date('2026-09-16T12:00:00.000Z')

function observation(overrides: Partial<RoutabilitySummary> = {}): RoutabilitySummary {
  return {
    slug: 'example-model',
    status: 'unavailable',
    source: 'openrouter-runtime',
    note: 'Explicit 404',
    checkedAt: '2026-09-16T08:35:19.418Z',
    consecutiveFailures: 2,
    ...overrides,
  }
}

describe('isBlockingRoutabilityObservation', () => {
  it('does not block after a single explicit unavailable observation', () => {
    expect(isBlockingRoutabilityObservation(observation({ consecutiveFailures: 1 }), NOW)).toBe(false)
  })

  it('blocks repeated recent explicit unavailability', () => {
    expect(isBlockingRoutabilityObservation(observation(), NOW)).toBe(true)
  })

  it('never blocks degraded observations', () => {
    expect(isBlockingRoutabilityObservation(observation({ status: 'degraded', consecutiveFailures: 5 }), NOW)).toBe(false)
  })

  it('does not block stale observations', () => {
    expect(isBlockingRoutabilityObservation(observation({ checkedAt: '2026-09-14T08:35:19.418Z' }), NOW)).toBe(false)
  })

  it('fails open for malformed timestamps', () => {
    expect(isBlockingRoutabilityObservation(observation({ checkedAt: 'not-a-date' }), NOW)).toBe(false)
  })
})
