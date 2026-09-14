'use server'

import { createHash } from 'crypto'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

import { getCurrentUser } from '@/lib/auth'
import { classifyTask, type Classification } from '@/lib/classification'
import { createTaskWithOwner } from '@/db/tasks'
import { updateTaskPriorities, saveRecommendations } from '@/lib/db'
import { scoreModelsDetailed } from '@/lib/scoring'
import { getLatestBenchmarkScores } from '@/lib/benchmarks'
import type { Factor } from '@/lib/registry'

function embeddingPriorityFor(dataSensitivity: Classification['data_sensitivity']): Factor[] {
  if (dataSensitivity === 'on_prem_required') {
    return ['quality', 'transparency', 'privacy', 'sustainability', 'cost', 'speed', 'capability']
  }
  return ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']
}

async function prepareEmbeddingRecommendation(
  taskId: string,
  classification: Classification,
): Promise<void> {
  const priorityOrder = embeddingPriorityFor(classification.data_sensitivity)
  await updateTaskPriorities(taskId, priorityOrder)

  const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
  const { models } = scoreModelsDetailed({
    taskType: 'embedding',
    complexity: classification.complexity,
    inputLength: classification.input_length,
    needsVision: false,
    needsTools: false,
    needsCode: false,
    needsReasoning: false,
    dataSensitivity: classification.data_sensitivity,
    latencyTarget: classification.latency_target,
    volume: 'one_off',
    needsLongContext: false,
    needsMultilingual: classification.needs_multilingual,
    isAgentic: false,
    outputLength: 'short',
    priorityOrder,
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

async function maybeRouteEmbedding(
  taskId: string,
  classification: Classification,
): Promise<void> {
  const hasPipelineStages = (classification.pipeline_stages?.length ?? 0) > 0
  if (classification.task_type !== 'embedding' || hasPipelineStages) return

  await prepareEmbeddingRecommendation(taskId, classification)
  redirect(`/embedding/${taskId}/results`)
}

/**
 * Initial bearing submission with optional ownership attached atomically to the
 * task row. This intentionally mirrors the existing submitTask flow while the
 * broader actions.ts split progresses; clarification continues through the
 * existing action and preserves the owner already stored on the task.
 */
export async function submitBearingTask(formData: FormData) {
  try {
    const description = formData.get('description')
    if (!description || typeof description !== 'string' || !description.trim()) {
      return { error: 'Description is required.' }
    }

    const trimmed = description.trim()
    const [classification, user] = await Promise.all([
      classifyTask(trimmed),
      getCurrentUser(),
    ])

    const descriptionHash = createHash('sha256')
      .update(trimmed.toLowerCase())
      .digest('hex')

    const taskId = await createTaskWithOwner({
      userId: user?.id ?? null,
      descriptionHash,
      taskType: classification.task_type,
      taskSubtype: classification.task_subtype,
      complexity: classification.complexity,
      inputLength: classification.input_length,
      needsVision: classification.needs_vision,
      needsTools: classification.needs_tools,
      needsCode: classification.needs_code,
      needsReasoning: classification.needs_reasoning,
      isRecurring: classification.is_recurring,
      dataSensitivity: classification.data_sensitivity,
      latencyTarget: classification.latency_target,
      volume: classification.volume,
      needsLongContext: classification.needs_long_context,
      needsMultilingual: classification.needs_multilingual,
      isAgentic: classification.is_agentic,
      outputLength: classification.output_length,
      mode: 'recommend',
      classificationConfidence: classification.confidence,
      pipelineStages: classification.pipeline_stages,
    })

    if (classification.confidence < 0.6 || classification.clarification_needed) {
      return {
        taskId,
        needsClarification: true,
        questions: classification.suggested_questions,
        description: trimmed,
      }
    }

    await maybeRouteEmbedding(taskId, classification)
    redirect(`/recommend/${taskId}/priorities`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit task.' }
  }
}
