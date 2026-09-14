import type { Factor } from './registry'

export const LEARNABLE_PREFERENCE_FACTORS = [
  'cost',
  'speed',
  'privacy',
  'transparency',
  'sustainability',
] as const satisfies readonly Factor[]

export type LearnablePreferenceFactor = typeof LEARNABLE_PREFERENCE_FACTORS[number]

export interface PreferenceDecisionEvidence {
  selectedFactorScores: Partial<Record<Factor, number>>
  recommendedFactorScores: Partial<Record<Factor, number>>
}

export interface LearnedPreferenceSignal {
  factor: LearnablePreferenceFactor
  support: number
  decisions: number
  ratio: number
  meanPositiveDelta: number
  learned: boolean
}

export interface LearnedPreferenceProfile {
  decisions: number
  factors: LearnablePreferenceFactor[]
  signals: LearnedPreferenceSignal[]
}

const MIN_DECISIONS = 3
const MIN_SUPPORT = 2
const MIN_SUPPORT_RATIO = 0.5
const MATERIAL_DELTA = 0.08

function finiteScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Infer lightweight factor tendencies from explicit model choices. A decision
 * only supports a factor when the chosen alternative was materially stronger
 * on that factor than the model Bearing ranked first for the same task.
 *
 * This intentionally learns slowly: at least three override decisions overall,
 * at least two supporting examples, and support in at least half of decisions.
 * The output is inspectable evidence, not a hidden personalised score.
 */
export function inferLearnedPreferenceProfile(
  decisions: PreferenceDecisionEvidence[],
): LearnedPreferenceProfile {
  const usable = decisions.filter((decision) =>
    LEARNABLE_PREFERENCE_FACTORS.some((factor) => {
      const selected = finiteScore(decision.selectedFactorScores[factor])
      const recommended = finiteScore(decision.recommendedFactorScores[factor])
      return selected !== null && recommended !== null
    }),
  )

  const signals = LEARNABLE_PREFERENCE_FACTORS.map((factor) => {
    let support = 0
    let positiveDeltaTotal = 0
    let comparable = 0

    for (const decision of usable) {
      const selected = finiteScore(decision.selectedFactorScores[factor])
      const recommended = finiteScore(decision.recommendedFactorScores[factor])
      if (selected === null || recommended === null) continue
      comparable += 1
      const delta = selected - recommended
      if (delta >= MATERIAL_DELTA) {
        support += 1
        positiveDeltaTotal += delta
      }
    }

    const ratio = comparable > 0 ? support / comparable : 0
    const learned =
      usable.length >= MIN_DECISIONS &&
      support >= MIN_SUPPORT &&
      ratio >= MIN_SUPPORT_RATIO

    return {
      factor,
      support,
      decisions: comparable,
      ratio,
      meanPositiveDelta: support > 0 ? positiveDeltaTotal / support : 0,
      learned,
    }
  })

  return {
    decisions: usable.length,
    factors: signals.filter((signal) => signal.learned).map((signal) => signal.factor),
    signals,
  }
}

export function effectivePreferenceFactors(input: {
  manualFactors: LearnablePreferenceFactor[]
  learnedFactors: LearnablePreferenceFactor[]
  learningEnabled: boolean
}): LearnablePreferenceFactor[] {
  const wanted = new Set<LearnablePreferenceFactor>(input.manualFactors)
  if (input.learningEnabled) {
    for (const factor of input.learnedFactors) wanted.add(factor)
  }
  return LEARNABLE_PREFERENCE_FACTORS.filter((factor) => wanted.has(factor))
}

export function isLearnablePreferenceFactor(value: unknown): value is LearnablePreferenceFactor {
  return typeof value === 'string' &&
    (LEARNABLE_PREFERENCE_FACTORS as readonly string[]).includes(value)
}
