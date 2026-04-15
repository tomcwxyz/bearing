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

  it('applies complexity boost for complex tasks', () => {
    const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const normal = priorityToWeights(order)
    const boosted = priorityToWeights(order, { complexity: 'complex' })
    expect(boosted.quality).toBeGreaterThan(normal.quality)
    expect(boosted.capability).toBeGreaterThan(normal.capability)
    const sum = Object.values(boosted).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('applies moderate complexity boost', () => {
    const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const normal = priorityToWeights(order)
    const moderate = priorityToWeights(order, { complexity: 'moderate' })
    const complex = priorityToWeights(order, { complexity: 'complex' })
    expect(moderate.quality).toBeGreaterThan(normal.quality)
    expect(complex.quality).toBeGreaterThan(moderate.quality)
  })

  it('no boost for simple complexity', () => {
    const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const normal = priorityToWeights(order)
    const simple = priorityToWeights(order, { complexity: 'simple' })
    expect(simple.quality).toBeCloseTo(normal.quality, 5)
  })

  it('excludes factors and redistributes weight', () => {
    const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const weights = priorityToWeights(order, { excludedFactors: ['sustainability', 'transparency'] })
    expect(weights.sustainability).toBe(0)
    expect(weights.transparency).toBe(0)
    expect(weights.quality).toBeGreaterThan(0)
    const sum = Object.values(weights).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('excluded factors give higher quality weight than all-included', () => {
    const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const normal = priorityToWeights(order)
    const excluded = priorityToWeights(order, { excludedFactors: ['sustainability', 'transparency', 'speed'] })
    expect(excluded.quality).toBeGreaterThan(normal.quality)
  })

  it('works with both complexity boost and exclusions', () => {
    const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const weights = priorityToWeights(order, {
      complexity: 'complex',
      excludedFactors: ['sustainability', 'transparency', 'speed'],
    })
    expect(weights.sustainability).toBe(0)
    expect(weights.quality).toBeGreaterThan(0.4)
    const sum = Object.values(weights).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })
})
