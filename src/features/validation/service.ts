import { getLatestBenchmarkScores } from '@/lib/benchmarks'
import { getTask } from '@/lib/db'
import type { ScoredModel } from '@/lib/scoring'
import { scoreModels } from '@/lib/scoring'
import { scoringInputFromTask } from '@/features/recommendations/scoring-input'

export type ValidationAssessment = 'good_fit' | 'overpaying' | 'better_options'

export interface ValidationAssessmentInput {
  currentModel: ScoredModel | null
  currentModelRank: number | null
}

/** Keep the judgement policy separate from transport/DB concerns so it is testable. */
export function assessValidation({
  currentModel,
  currentModelRank,
}: ValidationAssessmentInput): ValidationAssessment {
  if (!currentModel || currentModelRank === null) return 'better_options'
  if (currentModelRank === 1) return 'good_fit'
  if (currentModelRank <= 3 && currentModel.factorScores.cost < 0.5) return 'overpaying'
  if (currentModelRank <= 3) return 'good_fit'
  return 'better_options'
}

/**
 * Score the task with the same persisted-task contract used by recommendations
 * and routed experiments, then assess the user's current model against it.
 */
export async function getValidationResults(taskId: string, currentModelSlug: string) {
  try {
    const task = await getTask(taskId)
    if (!task) return { error: 'Task not found.' as const }

    const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
    const models = scoreModels(scoringInputFromTask(task, benchmarkScores))

    const currentModelIndex = models.findIndex((model) => model.slug === currentModelSlug)
    const currentModel = currentModelIndex >= 0 ? models[currentModelIndex] : null
    const currentModelRank = currentModelIndex >= 0 ? currentModelIndex + 1 : null
    const assessment = assessValidation({ currentModel, currentModelRank })

    return { task, models, currentModel, currentModelRank, assessment }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to get validation results.',
    }
  }
}
