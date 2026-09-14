import { describe, expect, it } from 'vitest'
import {
  effectivePreferenceFactors,
  inferLearnedPreferenceProfile,
} from '../bearing-preferences'

function decision(input: {
  selected?: Record<string, number>
  recommended?: Record<string, number>
} = {}) {
  return {
    selectedFactorScores: {
      cost: 0.5,
      speed: 0.5,
      privacy: 0.5,
      transparency: 0.5,
      sustainability: 0.5,
      ...input.selected,
    },
    recommendedFactorScores: {
      cost: 0.5,
      speed: 0.5,
      privacy: 0.5,
      transparency: 0.5,
      sustainability: 0.5,
      ...input.recommended,
    },
  }
}

describe('inferLearnedPreferenceProfile', () => {
  it('does not learn from a single override', () => {
    const profile = inferLearnedPreferenceProfile([
      decision({ selected: { cost: 0.8 }, recommended: { cost: 0.5 } }),
    ])

    expect(profile.decisions).toBe(1)
    expect(profile.factors).toEqual([])
  })

  it('learns a repeated material factor preference after enough decisions', () => {
    const profile = inferLearnedPreferenceProfile([
      decision({ selected: { cost: 0.8 }, recommended: { cost: 0.5 } }),
      decision({ selected: { cost: 0.72 }, recommended: { cost: 0.55 } }),
      decision({ selected: { speed: 0.7 }, recommended: { speed: 0.65 } }),
    ])

    expect(profile.factors).toContain('cost')
    const cost = profile.signals.find((signal) => signal.factor === 'cost')
    expect(cost?.support).toBe(2)
    expect(cost?.learned).toBe(true)
  })

  it('ignores tiny factor differences that are not a meaningful trade-off', () => {
    const profile = inferLearnedPreferenceProfile([
      decision({ selected: { privacy: 0.57 }, recommended: { privacy: 0.5 } }),
      decision({ selected: { privacy: 0.56 }, recommended: { privacy: 0.5 } }),
      decision({ selected: { privacy: 0.58 }, recommended: { privacy: 0.51 } }),
    ])

    expect(profile.factors).not.toContain('privacy')
  })

  it('requires repeated support rather than one extreme outlier', () => {
    const profile = inferLearnedPreferenceProfile([
      decision({ selected: { sustainability: 1 }, recommended: { sustainability: 0.1 } }),
      decision(),
      decision(),
      decision(),
    ])

    expect(profile.factors).not.toContain('sustainability')
  })
})

describe('effectivePreferenceFactors', () => {
  it('combines explicit defaults with learned factors when learning is enabled', () => {
    expect(effectivePreferenceFactors({
      manualFactors: ['privacy'],
      learnedFactors: ['cost', 'privacy'],
      learningEnabled: true,
    })).toEqual(['cost', 'privacy'])
  })

  it('uses only explicit defaults when learning is disabled', () => {
    expect(effectivePreferenceFactors({
      manualFactors: ['privacy'],
      learnedFactors: ['cost'],
      learningEnabled: false,
    })).toEqual(['privacy'])
  })
})
