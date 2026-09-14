import { neon } from '@neondatabase/serverless'
import type { Factor } from '@/lib/registry'
import {
  isLearnablePreferenceFactor,
  type LearnablePreferenceFactor,
  type PreferenceDecisionEvidence,
} from '@/lib/bearing-preferences'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export interface BearingPreferenceSettings {
  learningEnabled: boolean
  manualFactors: LearnablePreferenceFactor[]
  learningSince: string | null
  hasSavedSettings: boolean
  schemaAvailable: boolean
}

function isMissingPreferenceSchema(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  if (candidate.code === '42P01' || candidate.code === '42703') return true
  return typeof candidate.message === 'string' && (
    candidate.message.includes('user_bearing_preferences') ||
    candidate.message.includes('routed_runs') ||
    candidate.message.includes('routed_run_models')
  )
}

function parseFactorArray(value: unknown): LearnablePreferenceFactor[] {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isLearnablePreferenceFactor)
}

function parseFactorScores(value: unknown): Partial<Record<Factor, number>> | null {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const scores: Partial<Record<Factor, number>> = {}
  for (const [key, raw] of Object.entries(parsed)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      scores[key as Factor] = raw
    }
  }
  return scores
}

function timestampString(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Missing migration 031 is rollout-safe, but schemaAvailable=false is
 * important: Bearing must not apply learned personalisation before the user
 * has a surface where they can inspect, disable and reset it.
 */
export async function getBearingPreferenceSettings(userId: string): Promise<BearingPreferenceSettings> {
  try {
    const rows = await getDb()`
      SELECT learning_enabled, preferred_factors, learning_since
      FROM user_bearing_preferences
      WHERE user_id = ${userId}
      LIMIT 1
    `
    if (rows.length === 0) {
      return {
        learningEnabled: true,
        manualFactors: [],
        learningSince: null,
        hasSavedSettings: false,
        schemaAvailable: true,
      }
    }
    return {
      learningEnabled: rows[0].learning_enabled !== false,
      manualFactors: parseFactorArray(rows[0].preferred_factors),
      learningSince: timestampString(rows[0].learning_since),
      hasSavedSettings: true,
      schemaAvailable: true,
    }
  } catch (error) {
    if (isMissingPreferenceSchema(error)) {
      return {
        learningEnabled: true,
        manualFactors: [],
        learningSince: null,
        hasSavedSettings: false,
        schemaAvailable: false,
      }
    }
    throw error
  }
}

export async function saveBearingPreferenceSettings(
  userId: string,
  input: { learningEnabled: boolean; manualFactors: LearnablePreferenceFactor[] },
): Promise<void> {
  await getDb()`
    INSERT INTO user_bearing_preferences (
      user_id, learning_enabled, preferred_factors, learning_since, updated_at
    ) VALUES (
      ${userId},
      ${input.learningEnabled},
      ${JSON.stringify(input.manualFactors)},
      NULL,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      learning_enabled = EXCLUDED.learning_enabled,
      preferred_factors = EXCLUDED.preferred_factors,
      updated_at = now()
  `
}

/**
 * Reset explicit defaults and begin a fresh learning window. Historical Trio /
 * Challenger data remains intact for the public evidence dataset; it simply no
 * longer participates in this user's personalised defaults.
 */
export async function resetBearingPreferenceSettings(userId: string): Promise<void> {
  await getDb()`
    INSERT INTO user_bearing_preferences (
      user_id, learning_enabled, preferred_factors, learning_since, updated_at
    ) VALUES (
      ${userId}, true, ${JSON.stringify([])}, now(), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      learning_enabled = true,
      preferred_factors = ${JSON.stringify([])},
      learning_since = now(),
      updated_at = now()
  `
}

/**
 * Learn only from authenticated human preferences on Trio / Challenger runs.
 * Those runs store the factor scores shown at experiment time plus user_id, so
 * a shared task URL or anonymous selection cannot contaminate another person's
 * profile. Choosing the primary does not count as an override; choosing a
 * challenger creates one inspectable trade-off decision.
 */
export async function getPreferenceDecisionEvidence(
  userId: string,
  learningSince: string | null = null,
  limit = 50,
): Promise<PreferenceDecisionEvidence[]> {
  try {
    const rows = await getDb()`
      SELECT
        selected.factor_scores AS selected_factor_scores,
        primary_model.factor_scores AS recommended_factor_scores
      FROM routed_runs rr
      JOIN routed_run_models selected
        ON selected.routed_run_id = rr.id
       AND selected.model_slug = rr.human_preferred
       AND COALESCE(selected.is_error, false) = false
      JOIN LATERAL (
        SELECT model_slug, factor_scores
        FROM routed_run_models primary_candidate
        WHERE primary_candidate.routed_run_id = rr.id
          AND primary_candidate.role = 'primary'
          AND COALESCE(primary_candidate.is_error, false) = false
        ORDER BY primary_candidate.route_rank ASC, primary_candidate.created_at ASC
        LIMIT 1
      ) primary_model ON true
      WHERE rr.user_id = ${userId}
        AND rr.mode IN ('trio', 'challenger')
        AND rr.human_preferred IS NOT NULL
        AND rr.human_preferred <> 'tie'
        AND selected.model_slug <> primary_model.model_slug
        AND (${learningSince}::timestamptz IS NULL OR rr.created_at >= ${learningSince}::timestamptz)
      ORDER BY rr.created_at DESC
      LIMIT ${Math.max(1, Math.min(limit, 200))}
    `

    return rows.flatMap((row) => {
      const selectedFactorScores = parseFactorScores(row.selected_factor_scores)
      const recommendedFactorScores = parseFactorScores(row.recommended_factor_scores)
      if (!selectedFactorScores || !recommendedFactorScores) return []
      return [{ selectedFactorScores, recommendedFactorScores }]
    })
  } catch (error) {
    // Preference learning is additive. Older deployments without routed-run or
    // preference schema simply have no behavioural evidence yet.
    if (isMissingPreferenceSchema(error)) return []
    throw error
  }
}
