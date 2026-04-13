import { describe, it, expect } from 'vitest'
import { formatGranularity } from '../dashboard'

describe('formatGranularity', () => {
  it('passes through valid granularities', () => {
    expect(formatGranularity('day')).toBe('day')
    expect(formatGranularity('week')).toBe('week')
    expect(formatGranularity('month')).toBe('month')
  })

  it('defaults to day for invalid input', () => {
    expect(formatGranularity('year')).toBe('day')
    expect(formatGranularity('')).toBe('day')
    expect(formatGranularity('hourly')).toBe('day')
  })
})
