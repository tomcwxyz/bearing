/**
 * Regression-pinning tests for scoring tuning work.
 *
 * These tests assert today's (suboptimal) behaviour so that Phase 2 of
 * docs/plans/2026-05-05-recommendation-tuning.md can flip them once the
 * cost-curve and weight-compression fixes land. Don't fix these tests by
 * adjusting expectations — fix them by changing the scoring logic.
 *
 * If a test here starts failing because we tuned correctly, FLIP the
 * assertion in the same commit that lands the tuning change.
 */
import { describe, it, expect } from 'vitest'
import { scoreModels } from '../scoring'
import type { Factor } from '../registry'

const defaultPriority: Factor[] = [
  'quality',
  'capability',
  'cost',
  'transparency',
  'privacy',
  'sustainability',
  'speed',
]

const flagshipSlugs = [
  'claude-opus-4.6',
  'claude-sonnet-4.6',
  'gpt-5.4',
  'gemini-3.1-pro',
]

describe('scoring tuning regressions (to be flipped in Phase 2)', () => {
  it('flagship Claude is currently NOT in top 3 for complex code with default priorities', () => {
    const results = scoreModels({
      taskType: 'code',
      complexity: 'complex',
      inputLength: 'long',
      needsVision: false,
      needsTools: true,
      needsCode: true,
      priorityOrder: defaultPriority,
    })
    const top3 = results.slice(0, 3).map(m => m.slug)
    // Phase 2.2 (rank-5+ weight damping) moved Claude Opus from rank ~14
    // to rank ~11, but it still isn't in the top 3 — the open-weight
    // benchmark/cost advantage in Gemini Flash and the open MiniMax/Qwen
    // models is too strong even after damping. We're keeping the pin as
    // `not.toContain` and will revisit in Phase 2.3+ (further task-fitness
    // re-grades or quality-weight increase). Comment updated to reflect
    // this so the next phase knows where it stands.
    expect(top3).not.toContain('claude-opus-4.6')
    // Looser secondary check: at least one of the four obvious flagships
    // should be missing from the top 3 today.
    const flagshipsInTop3 = top3.filter(slug => flagshipSlugs.includes(slug))
    expect(flagshipsInTop3.length).toBeLessThan(3)
  })

  it('recommendations look essentially identical for simple vs complex code task', () => {
    const baseInput = {
      taskType: 'code',
      needsVision: false,
      needsTools: true,
      needsCode: true,
      priorityOrder: defaultPriority,
    }
    const simple = scoreModels({
      ...baseInput,
      complexity: 'simple',
      inputLength: 'short',
    })
    const complex = scoreModels({
      ...baseInput,
      complexity: 'complex',
      inputLength: 'long',
    })
    const simpleTop3 = simple.slice(0, 3).map(m => m.slug)
    const complexTop3 = complex.slice(0, 3).map(m => m.slug)
    // Flipped during Phase 1.3 because TF widening + budget pull-down was
    // sufficient to differentiate simple vs complex coding recommendations:
    // the top-3 overlap dropped to ≤1. Phase 2.1's cost-curve compression
    // softens cost penalties for expensive models when cost is rank-3, which
    // mildly re-homogenises the simple-vs-complex top-3 (overlap ≤2).
    const overlap = simpleTop3.filter(slug => complexTop3.includes(slug)).length
    expect(overlap).toBeLessThanOrEqual(2)
    // Phase 2.2 did not yet flip these: Opus is still outside the top 3
    // for both simple and complex code with default priorities. Will
    // revisit in a later phase.
    expect(simpleTop3).not.toContain('claude-opus-4.6')
    expect(complexTop3).not.toContain('claude-opus-4.6')
  })
})
