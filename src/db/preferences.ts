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
  hasSavedSettings: boolean
}

function isMissingPreferenceSchema(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  if (candidate.code === '42P01' || candidate.code === '42703') return true
  return typeof candidate.message === 'string' && (
    candidate.message.includes('user_bearing_preferences') ||
    candidate.message.includes('user_id')
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

/** Missing migration 031 is treated as default settings so rollout is safe. */
export async function getBearingPreferenceSettings(userId: string): Promise<BearingPreferenceSettings> {
  try {
    const rows = await getDb()`
      SELECT learning_enabled, preferred_factors
      FROM user_bearing_preferences
      WHERE user_id = ${userId}
      LIMIT 1
    `
    if (rows.length === 0) {
      return { learningEnabled: true, manualFactors: [], hasSavedSettings: false }
    }
    return {
      learningEnabled: rows[0].learning_enabled !== false,
      manualFactors: parseFactorArray(rows[0].preferred_factors),
      hasSavedSettings: true,
    }
  } catch (error) {
    if (isMissingPreferenceSchema(error)) {
      return { learningEnabled: true, manualFactors: [], hasSavedSettings: false }
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
      user_id, learning_enabled, preferred_factors, updated_at
    ) VALUES (
      ${userId},
      ${input.learningEnabled},
      ${JSON.stringify(input.manualFactors)},
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      learning_enabled = EXCLUDED.learning_enabled,
      preferred_factors = EXCLUDED.preferred_factors,
      updated_at = now()
  `
}

export async function resetBearingPreferenceSettings(userId: string): Promise<void> {
  try {
    await getDb()`
      DELETE FROM user_bearing_preferences
      WHERE user_id = ${userId}
    `
  } catch (error) {
    if (!isMissingPreferenceSchema(error)) throw error
  }
}

/**
 * Reconstruct the factor trade-off visible when each owned selection was made.
 * Recommendation rows are chosen at or before the selection timestamp so later
 * catalogue/ranking refreshes do not rewrite the evidence Bearing learns from.
 */
export async function getPreferenceDecisionEvidence(
  userId: string,
  limit = 50,
): Promise<PreferenceDecisionEvidence[]> {
  try {
    const rows = await getDb()`
      SELECT
        selected.factor_scores AS selected_factor_scores,
        recommended.factor_scores AS recommended_factor_scores
      FROM selections s
      JOIN tasks t ON t.id = s.task_id
      JOIN LATERAL (
        SELECT r.factor_scores
        FROM recommendations r
        WHERE r.task_id = s.task_id
          AND r.model_slug = s.model_slug
          AND r.created_at <= s.created_at
        ORDER BY r.created_at DESC
        LIMIT 1
      ) selected ON true
      JOIN LATERAL (
        SELECT r.factor_scores
        FROM recommendations r
        WHERE r.task_id = s.task_id
          AND r.rank = 1
          AND r.created_at <= s.created_at
        ORDER BY r.created_at DESC
        LIMIT 1
      ) recommended ON true
      WHERE t.user_id = ${userId}
        AND COALESCE(s.source, 'recommend') = 'recommend'
        AND COALESCE(s.recommended_rank, 1) > 1
      ORDER BY s.created_at DESC
      LIMIT ${Math.max(1, Math.min(limit, 200))}
    `

    return rows.flatMap((row) => {
      const selectedFactorScores = parseFactorScores(row.selected_factor_scores)
      const recommendedFactorScores = parseFactorScores(row.recommended_factor_scores)
      if (!selectedFactorScores || !recommendedFactorScores) return []
      return [{ selectedFactorScores, recommendedFactorScores }]
    })
  } catch (error) {
    // Migration 030 may not be present yet. In that case there is simply no
    // owned behavioural evidence to learn from.
    if (isMissingPreferenceSchema(error)) return []
    throw error
  }
}
