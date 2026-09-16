import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export interface RecommendationInput {
  modelSlug: string
  rank: number
  weightedScore: number
  factorScores: Record<string, number>
  reasoning?: string
}

export interface LocalRecommendationInput {
  modelSlug: string
  rank: number
  effectiveQuality: number
  quant: string
  vramGb: number
  qualityPenalty: number
  hardwareTierId: string
}

export async function saveRecommendations(
  taskId: string,
  models: RecommendationInput[],
): Promise<void> {
  for (const model of models) {
    await getDb()`
      INSERT INTO recommendations (
        task_id, model_slug, rank, weighted_score, factor_scores, reasoning
      ) VALUES (
        ${taskId},
        ${model.modelSlug},
        ${model.rank},
        ${model.weightedScore},
        ${JSON.stringify(model.factorScores)},
        ${model.reasoning ?? null}
      )
    `
  }
}

export async function saveLocalRecommendations(
  taskId: string,
  candidates: LocalRecommendationInput[],
): Promise<void> {
  for (const candidate of candidates) {
    await getDb()`
      INSERT INTO local_recommendations (
        task_id, model_slug, rank, effective_quality,
        quant, vram_gb, quality_penalty, hardware_tier_id
      ) VALUES (
        ${taskId},
        ${candidate.modelSlug},
        ${candidate.rank},
        ${candidate.effectiveQuality},
        ${candidate.quant},
        ${candidate.vramGb},
        ${candidate.qualityPenalty},
        ${candidate.hardwareTierId}
      )
    `
  }
}
