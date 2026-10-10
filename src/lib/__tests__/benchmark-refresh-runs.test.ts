import { describe, expect, it } from 'vitest'
import { effectiveRefreshStatus } from '@/db/benchmark-refresh-runs'

describe('LMArena independent run statuses', () => {
  const now = new Date('2026-10-09T22:00:00Z')
  it('does not call a crashed or timed-out run successful', () => {
    expect(effectiveRefreshStatus('running', '2026-10-09T21:30:00Z', now)).toBe('interrupted')
  })
  it('allows a current in-progress run to be shown as running', () => {
    expect(effectiveRefreshStatus('running', '2026-10-09T21:55:00Z', now)).toBe('running')
  })
  it('preserves an explicitly failed or successful state', () => {
    expect(effectiveRefreshStatus('failed', '2026-10-09T20:00:00Z', now)).toBe('failed')
    expect(effectiveRefreshStatus('succeeded', '2026-10-09T20:00:00Z', now)).toBe('succeeded')
  })
})
