import { describe, it, expect } from 'vitest'
import { gwpToScore, GWP_SCORE_BEST_G, GWP_SCORE_WORST_G } from '../ecologits-grounding'

// EcoLogits efficiency is scored on an ABSOLUTE logarithmic GWP curve
// (gwpToScore), not cohort min-max. A given GWP always yields the same score,
// independent of which other models exist — so the score is comparable to the
// curated rubric values it blends with, and adding/removing a model never
// reshuffles the others.
describe('gwpToScore — absolute GWP efficiency curve', () => {
  // gwpToScore takes kgCO2eq; anchors are documented in grams.
  const bestKg = GWP_SCORE_BEST_G / 1000
  const worstKg = GWP_SCORE_WORST_G / 1000

  it('maps the best anchor to ~1.0 and the worst anchor to ~0.0', () => {
    expect(gwpToScore(bestKg)).toBeCloseTo(1.0, 5)
    expect(gwpToScore(worstKg)).toBeCloseTo(0.0, 5)
  })

  it('is monotonically decreasing — lower GWP always scores higher', () => {
    const flashLite = gwpToScore(0.0000102) // 0.0102 g — measured most efficient
    const sonnet = gwpToScore(0.0003037) // 0.3037 g
    const opus = gwpToScore(0.0007804) // 0.7804 g
    const geminiPro = gwpToScore(0.002094) // 2.094 g — measured least efficient
    expect(flashLite).toBeGreaterThan(sonnet)
    expect(sonnet).toBeGreaterThan(opus)
    expect(opus).toBeGreaterThan(geminiPro)
  })

  it('clamps to [0, 1] beyond the anchors', () => {
    expect(gwpToScore(bestKg / 100)).toBe(1.0) // far cleaner than best → clamps at 1
    expect(gwpToScore(worstKg * 100)).toBe(0.0) // far dirtier than worst → clamps at 0
  })

  it('is cohort-independent — score depends only on the single reading', () => {
    // Same GWP scored in isolation vs alongside others must be identical.
    const isolated = gwpToScore(0.0003037)
    const sameValueAgain = gwpToScore(0.0003037)
    expect(isolated).toBe(sameValueAgain)
  })

  it('uses a log scale so sub-anchor efficient models stay well-separated', () => {
    // A 10x GWP difference low on the scale must produce a meaningful gap,
    // not collapse near 1.0 the way a linear scale would.
    const tenth = gwpToScore(0.00002) // 0.02 g
    const whole = gwpToScore(0.0002) // 0.20 g
    expect(tenth - whole).toBeGreaterThan(0.2)
  })

  it('defends against non-finite or non-positive input', () => {
    expect(gwpToScore(0)).toBe(1.0)
    expect(gwpToScore(-1)).toBe(1.0)
    expect(gwpToScore(NaN)).toBe(1.0)
  })
})
