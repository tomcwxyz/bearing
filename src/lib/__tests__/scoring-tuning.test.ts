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
    // Pin the bug: Claude Opus (the flagship coding model) is missing from
    // the top 3 even when the user explicitly prioritises quality+capability
    // for a complex coding task. Phase 2's weight compression should flip
    // this — once it does, replace `not.toContain` with `toContain`.
    expect(top3).not.toContain('claude-opus-4.6')
    // Looser secondary check: at least one of the four obvious flagships
    // should be missing from the top 3 today. Once Phase 2 lands, the top 3
    // should be dominated by flagships and this will fail too.
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
    // the top-3 overlap now drops to ≤1 (complex+long surfaces a different
    // mix of mid-tier models than simple+short, even though Opus still
    // hasn't broken into the top 3 — that's still Phase 2's job).
    const overlap = simpleTop3.filter(slug => complexTop3.includes(slug)).length
    expect(overlap).toBeLessThanOrEqual(1)
    // Neither top 3 should already contain Claude Opus today (otherwise
    // Phase 2 has effectively already happened).
    expect(simpleTop3).not.toContain('claude-opus-4.6')
    expect(complexTop3).not.toContain('claude-opus-4.6')
  })
})
