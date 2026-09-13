import { describe, expect, it } from 'vitest'
import { assessModelFreshness, freshnessLabel } from '../model-freshness'

const now = new Date('2026-09-13T12:00:00Z')

describe('assessModelFreshness', () => {
  it('marks a recent current verification as fresh', () => {
    const result = assessModelFreshness({
      verification_status: 'current',
      last_verified_at: '2026-09-10T12:00:00Z',
    }, now)

    expect(result.isStale).toBe(false)
    expect(result.needsAttention).toBe(false)
    expect(freshnessLabel(result)).toBe('Verified current')
  })

  it('marks current metadata stale after the threshold', () => {
    const result = assessModelFreshness({
      verification_status: 'current',
      last_verified_at: '2026-09-01T12:00:00Z',
    }, now)

    expect(result.isStale).toBe(true)
    expect(result.needsAttention).toBe(true)
    expect(freshnessLabel(result)).toBe('Verification stale')
  })

  it('treats never-verified models as needing attention', () => {
    const result = assessModelFreshness({ verification_status: 'unknown' }, now)

    expect(result.ageDays).toBeNull()
    expect(result.isStale).toBe(true)
    expect(result.needsAttention).toBe(true)
    expect(freshnessLabel(result)).toBe('Not verified')
  })

  it('keeps unavailable authoritative even when recently checked', () => {
    const result = assessModelFreshness({
      verification_status: 'unavailable',
      last_verified_at: '2026-09-13T11:00:00Z',
    }, now)

    expect(result.isStale).toBe(false)
    expect(result.needsAttention).toBe(true)
    expect(freshnessLabel(result)).toBe('Unavailable')
  })
})
