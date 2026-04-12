import { describe, it, expect } from 'vitest'
import { priorityToWeights } from '../weights'
import type { Factor } from '../registry'

describe('priorityToWeights', () => {
  it('returns default weights when given default priority order', () => {
    const defaultOrder: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const weights = priorityToWeights(defaultOrder)
    const sum = Object.values(weights).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
    expect(weights.quality).toBeGreaterThan(weights.speed)
  })

  it('boosts the top-ranked factor', () => {
    const privacyFirst: Factor[] = ['privacy', 'quality', 'capability', 'cost', 'transparency', 'sustainability', 'speed']
    const weights = priorityToWeights(privacyFirst)
    expect(weights.privacy).toBeGreaterThan(weights.quality)
    expect(weights.privacy).toBeGreaterThan(weights.cost)
  })

  it('weights always sum to 1.0', () => {
    const order: Factor[] = ['speed', 'cost', 'sustainability', 'transparency', 'privacy', 'capability', 'quality']
    const weights = priorityToWeights(order)
    const sum = Object.values(weights).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('last-ranked factor gets lowest weight', () => {
    const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const weights = priorityToWeights(order)
    const values = Object.entries(weights).sort((a, b) => b[1] - a[1])
    expect(values[values.length - 1][0]).toBe('speed')
  })
})
