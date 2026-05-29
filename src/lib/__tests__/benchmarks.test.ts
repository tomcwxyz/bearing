import { describe, it, expect } from 'vitest'

describe('EcoLogits normalisation arithmetic', () => {
  it('inverts so lower GWP gets higher normalised score', () => {
    const rawScores = [0.0003, 0.0001, 0.0002]
    const min = Math.min(...rawScores)
    const max = Math.max(...rawScores)
    const normalise = (raw: number) => 1 - (raw - min) / (max - min)

    expect(normalise(0.0001)).toBeCloseTo(1.0) // lowest GWP → score 1 (best)
    expect(normalise(0.0003)).toBeCloseTo(0.0) // highest GWP → score 0 (worst)
    expect(normalise(0.0002)).toBeCloseTo(0.5) // midpoint
  })

  it('returns 1.0 for single-model cohort (no range)', () => {
    const rawScores = [0.0002]
    const min = Math.min(...rawScores)
    const max = Math.max(...rawScores)
    const range = max - min
    const normalise = (raw: number) => range > 0 ? 1 - (raw - min) / range : 1.0

    expect(normalise(0.0002)).toBe(1.0)
  })

  it('computes midpoint from EcoLogits min/max range correctly', () => {
    // Real values from live Claude Sonnet 4.6 API call
    const min = 0.00019421974565466776
    const max = 0.0003072209779146819
    const midpoint = (min + max) / 2
    expect(midpoint).toBeGreaterThan(0.00024)
    expect(midpoint).toBeLessThan(0.00026)
  })

  it('small efficient model scores higher than large expensive model', () => {
    // Simulate haiku (small) vs opus (large)
    const haikuGwp = 0.0001   // small model, low GWP
    const opusGwp  = 0.0008   // large model, high GWP
    const rawScores = [haikuGwp, opusGwp]
    const min = Math.min(...rawScores)
    const max = Math.max(...rawScores)
    const normalise = (raw: number) => 1 - (raw - min) / (max - min)

    expect(normalise(haikuGwp)).toBeGreaterThan(normalise(opusGwp))
  })
})
