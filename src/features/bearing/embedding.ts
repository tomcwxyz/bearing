import { getLatestBenchmarkScores } from '@/lib/benchmarks'
import { nudgePriorityOrder } from '@/lib/bearing-policy'
import { scoreModelsDetailed } from '@/lib/scoring'
import { saveRecommendations, updateTaskPriorities } from '@/lib/db'
import type { Classification } from '@/lib/classification'
import type { Factor } from '@/lib/registry'

export interface EmbeddingFormInput {
  useCase: 'retrieval' | 'similarity' | 'classification' | 'clustering' | 'dedup' | 'other'
  inputSize: 'short' | 'medium' | 'long'
  hosting: 'hosted' | 'open' | 'no_preference'
  languages: 'english' | 'few' | 'many'
  latency: 'any' | 'interactive' | 'realtime'
}

export function embeddingPriorityForHosting(hosting: EmbeddingFormInput['hosting']): Factor[] {
  if (hosting === 'open') {
    return ['quality', 'transparency', 'privacy', 'sustainability', 'cost', 'speed', 'capability']
  }
  if (hosting === 'hosted') {
    return ['quality', 'speed', 'cost', 'capability', 'privacy', 'sustainability', 'transparency']
  }
  return ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']
}

export function hostingToDataSensitivity(
  hosting: EmbeddingFormInput['hosting'],
): Classification['data_sensitivity'] {
  return hosting === 'open' ? 'on_prem_required' : 'none'
}

function dataSensitivityToHosting(
  dataSensitivity: Classification['data_sensitivity'],
): EmbeddingFormInput['hosting'] {
  return dataSensitivity === 'on_prem_required' ? 'open' : 'no_preference'
}

export async function scoreAndSaveEmbedding(
  taskId: string,
  scoring: {
    complexity: string
    inputLength: string
    dataSensitivity: string
    latencyTarget: string
    needsMultilingual: boolean
    priorityOrder: Factor[]
  },
): Promise<void> {
  const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
  const { models } = scoreModelsDetailed({
    taskType: 'embedding',
    complexity: scoring.complexity,
    inputLength: scoring.inputLength,
    needsVision: false,
    needsTools: false,
    needsCode: false,
    needsReasoning: false,
    dataSensitivity: scoring.dataSensitivity,
    latencyTarget: scoring.latencyTarget,
    volume: 'one_off',
    needsLongContext: false,
    needsMultilingual: scoring.needsMultilingual,
    isAgentic: false,
    outputLength: 'short',
    priorityOrder: scoring.priorityOrder,
    benchmarkScores,
  })

  await saveRecommendations(
    taskId,
    models.map((model, index) => ({
      modelSlug: model.slug,
      rank: index + 1,
      weightedScore: model.weightedScore,
      factorScores: model.factorScores as Record<string, number>,
    })),
  )
}

/**
 * Prepare recommendations for a single-stage embedding task. Returns true when
 * it handled the task; embedding-led pipelines stay on the normal bearing path.
 */
export async function prepareSingleStageEmbedding(
  taskId: string,
  classification: Classification,
  preferredFactors: Factor[] = [],
): Promise<boolean> {
  const hasPipelineStages = (classification.pipeline_stages?.length ?? 0) > 0
  if (classification.task_type !== 'embedding' || hasPipelineStages) return false

  const basePriorityOrder = embeddingPriorityForHosting(
    dataSensitivityToHosting(classification.data_sensitivity),
  )
  const priorityOrder = nudgePriorityOrder(basePriorityOrder, preferredFactors)

  await updateTaskPriorities(taskId, priorityOrder)
  await scoreAndSaveEmbedding(taskId, {
    complexity: classification.complexity,
    inputLength: classification.input_length,
    dataSensitivity: classification.data_sensitivity,
    latencyTarget: classification.latency_target,
    needsMultilingual: classification.needs_multilingual,
    priorityOrder,
  })
  return true
}
