import {
  effectivePreferenceFactors,
  inferLearnedPreferenceProfile,
  type LearnablePreferenceFactor,
  type LearnedPreferenceProfile,
} from '@/lib/bearing-preferences'
import {
  getBearingPreferenceSettings,
  getPreferenceDecisionEvidence,
  type BearingPreferenceSettings,
} from '@/db/preferences'

export interface BearingPreferenceProfile {
  settings: BearingPreferenceSettings
  learned: LearnedPreferenceProfile
  effectiveFactors: LearnablePreferenceFactor[]
}

export async function getBearingPreferenceProfile(userId: string): Promise<BearingPreferenceProfile> {
  const settings = await getBearingPreferenceSettings(userId)
  const decisions = await getPreferenceDecisionEvidence(userId, settings.learningSince)
  const learned = inferLearnedPreferenceProfile(decisions)
  const effectiveFactors = settings.schemaAvailable
    ? effectivePreferenceFactors({
        manualFactors: settings.manualFactors,
        learnedFactors: learned.factors,
        learningEnabled: settings.learningEnabled,
      })
    : []

  return { settings, learned, effectiveFactors }
}

export async function getEffectiveBearingPreferenceFactors(
  userId: string,
): Promise<LearnablePreferenceFactor[]> {
  const profile = await getBearingPreferenceProfile(userId)
  return profile.effectiveFactors
}
