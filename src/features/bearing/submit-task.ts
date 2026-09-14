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
import { nudgePriorityOrder } from '@/lib/bearing-policy'
import { getEffectiveBearingPreferenceFactors } from './preferences'
import type { Factor } from '@/lib/registry'

export interface EmbeddingFormInput {
  useCase: 'retrieval' | 'similarity' | 'classification' | 'clustering' | 'dedup' | 'other'
  inputSize: 'short' | 'medium' | 'long'
  hosting: 'hosted' | 'open' | 'no_preference'
  languages: 'english' | 'few' | 'many'
  latency: 'any' | 'interactive' | 'realtime'
}

function embeddingPriorityForHosting(hosting: EmbeddingFormInput['hosting']): Factor[] {
  if (hosting === 'open') {
    return ['quality', 'transparency', 'privacy', 'sustainability', 'cost', 'speed', 'capability']
  }
  if (hosting === 'hosted') {
    return ['quality', 'speed', 'cost', 'capability', 'privacy', 'sustainability', 'transparency']
  }
  return ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']
}

function hostingToDataSensitivity(hosting: EmbeddingFormInput['hosting']): Classification['data_sensitivity'] {
  return hosting === 'open' ? 'on_prem_required' : 'none'
}

function dataSensitivityToHosting(
  dataSensitivity: Classification['data_sensitivity'],
): EmbeddingFormInput['hosting'] {
  return dataSensitivity === 'on_prem_required' ? 'open' : 'no_preference'
}

async function scoreAndSaveEmbedding(
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

async function prepareEmbeddingRecommendation(
  taskId: string,
  classification: Classification,
  preferredFactors: Factor[] = [],
): Promise<void> {
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
}

async function maybeRouteEmbedding(
  taskId: string,
  classification: Classification,
  preferredFactors: Factor[] = [],
): Promise<void> {
  const hasPipelineStages = (classification.pipeline_stages?.length ?? 0) > 0
  if (classification.task_type !== 'embedding' || hasPipelineStages) return

  await prepareEmbeddingRecommendation(taskId, classification, preferredFactors)
  redirect(`/embedding/${taskId}/results`)
}

async function preferencesForUser(userId: string | null | undefined): Promise<Factor[]> {
  if (!userId) return []
  return getEffectiveBearingPreferenceFactors(userId).catch((error) => {
    console.warn('[bearing] preference defaults unavailable', error)
    return []
  })
}

/**
 * Initial bearing submission with optional ownership attached atomically to the
 * task row. Clarification continues through the existing action and preserves
 * the owner already stored on the task.
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

    const preferredFactors = await preferencesForUser(user?.id)
    await maybeRouteEmbedding(taskId, classification, preferredFactors)
    redirect(`/recommend/${taskId}/priorities`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit task.' }
  }
}

/** Dedicated embedding-form submission with the same ownership semantics. */
export async function submitOwnedEmbeddingTask(input: EmbeddingFormInput) {
  try {
    const user = await getCurrentUser()
    const preferredFactors = await preferencesForUser(user?.id)
    const basePriorityOrder = embeddingPriorityForHosting(input.hosting)
    const priorityOrder = nudgePriorityOrder(basePriorityOrder, preferredFactors)
    const inputLength = input.inputSize === 'long' ? 'very_long' : input.inputSize
    const dataSensitivity = hostingToDataSensitivity(input.hosting)
    const latencyTarget = input.latency === 'any' ? 'batch' : input.latency

    const taskId = await createTaskWithOwner({
      userId: user?.id ?? null,
      taskType: 'embedding',
      taskSubtype: input.useCase,
      complexity: 'simple',
      inputLength,
      needsVision: false,
      needsTools: false,
      needsCode: false,
      needsReasoning: false,
      isRecurring: true,
      dataSensitivity,
      latencyTarget,
      volume: 'one_off',
      needsLongContext: false,
      needsMultilingual: input.languages !== 'english',
      isAgentic: false,
      outputLength: 'short',
      mode: 'embedding',
      priorityOrder,
      classificationConfidence: 1,
      pipelineStages: null,
    })

    await scoreAndSaveEmbedding(taskId, {
      complexity: 'simple',
      inputLength,
      dataSensitivity,
      latencyTarget,
      needsMultilingual: input.languages !== 'english',
      priorityOrder,
    })

    redirect(`/embedding/${taskId}/results`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to find embedding models.' }
  }
}
