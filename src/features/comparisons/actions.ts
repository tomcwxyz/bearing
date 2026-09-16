'use server'

import { createHash } from 'crypto'

import { getCurrentUser } from '@/lib/auth'
import {
  createComparison,
  getComparison,
  getUserComparisonCount,
  incrementUserComparisons,
  updateComparisonPreference,
  updateComparisonPrompt,
} from '@/db/comparisons'
import {
  getAllModelsFromDb,
  getModelFromDb,
  getOpenRouterId,
} from '@/db/models'
import { isUserAdmin } from '@/db/users'
import { createTask } from '@/lib/db'
import { filterPrompt } from '@/lib/content-filter'
import { extractText, validateFile } from '@/lib/file-parser'
import { callDirectProvider, callModel, DIRECT_PROVIDERS } from '@/lib/openrouter'
import { getRecommendationResults } from '@/features/recommendations/service'
import { buildRunMessages, type RunFileData } from '@/features/runs/run-messages'

const DAILY_COMPARISON_LIMIT = 4

export async function getModelsForCompare() {
  try {
    const models = await getAllModelsFromDb()
    return {
      models: models.map((model) => ({
        slug: model.slug,
        name: model.name,
        provider: model.provider,
        tier: model.tier,
        capabilities: model.capabilities,
        contextWindow: model.context_window,
      })),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to load models.' }
  }
}

/** Client-callable bridge to the shared recommendation service for task-based compare. */
export async function getComparisonRecommendations(taskId: string) {
  return getRecommendationResults(taskId)
}

export async function createDirectCompareTask(): Promise<{ taskId?: string; error?: string }> {
  try {
    const taskId = await createTask({
      descriptionHash: null,
      taskType: 'other',
      taskSubtype: null,
      complexity: 'moderate',
      inputLength: 'medium',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      isRecurring: false,
      mode: 'compare_direct',
      classificationConfidence: null,
      pipelineStages: null,
    })
    return { taskId }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create comparison task.' }
  }
}

export async function startComparison(
  taskId: string,
  modelASlug: string,
  modelBSlug: string,
) {
  try {
    const user = await getCurrentUser()
    if (!user) return { error: 'You must be signed in to compare models.' }

    if (!(await isUserAdmin(user.id))) {
      const today = new Date().toISOString().slice(0, 10)
      const { count, date } = await getUserComparisonCount(user.id)
      if (date === today && count >= DAILY_COMPARISON_LIMIT) {
        return { error: `You've used your ${DAILY_COMPARISON_LIMIT} daily comparisons` }
      }
    }

    const comparisonId = await createComparison(taskId, user.id, modelASlug, modelBSlug)
    return { comparisonId }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to start comparison.' }
  }
}

async function parseComparisonFile(formData: FormData): Promise<RunFileData | null | { error: string }> {
  const uploadedFile = formData.get('file') as File | null
  if (!uploadedFile || uploadedFile.size <= 0) return null

  const validation = validateFile(uploadedFile.name, uploadedFile.type, uploadedFile.size)
  if (!validation.valid) return { error: validation.error ?? 'Invalid file.' }

  const buffer = Buffer.from(await uploadedFile.arrayBuffer())
  const extractedText = await extractText(buffer, uploadedFile.type, uploadedFile.name)
  return {
    buffer,
    mimeType: uploadedFile.type,
    name: uploadedFile.name,
    extractedText,
  }
}

function comparisonRunFailure(error: string) {
  return {
    error,
    responseA: '',
    responseB: '',
    errorA: undefined as string | undefined,
    errorB: undefined as string | undefined,
  }
}

export async function runComparison(comparisonId: string, formData: FormData) {
  try {
    const user = await getCurrentUser()
    if (!user) return comparisonRunFailure('You must be signed in to compare models.')

    const comparison = await getComparison(comparisonId)
    if (!comparison) return comparisonRunFailure('Comparison not found.')
    if (comparison.user_id !== user.id) return comparisonRunFailure('Not authorized.')

    const prompt = formData.get('prompt') as string
    if (!prompt?.trim()) return comparisonRunFailure('Prompt is required.')

    const filtered = await filterPrompt(prompt)
    if (!filtered.safe) return comparisonRunFailure(filtered.reason || 'Prompt was flagged by content filter.')

    const parsedFile = await parseComparisonFile(formData)
    if (parsedFile && 'error' in parsedFile) return comparisonRunFailure(parsedFile.error)
    const file = parsedFile as RunFileData | null

    const [orIdA, orIdB, modelA, modelB] = await Promise.all([
      getOpenRouterId(comparison.model_a_slug),
      getOpenRouterId(comparison.model_b_slug),
      getModelFromDb(comparison.model_a_slug),
      getModelFromDb(comparison.model_b_slug),
    ])

    const directA = DIRECT_PROVIDERS[comparison.model_a_slug]
    const directB = DIRECT_PROVIDERS[comparison.model_b_slug]
    if (!orIdA && !directA) {
      return comparisonRunFailure(`Model ${comparison.model_a_slug} is not available for comparison.`)
    }
    if (!orIdB && !directB) {
      return comparisonRunFailure(`Model ${comparison.model_b_slug} is not available for comparison.`)
    }

    const messagesA = buildRunMessages(
      prompt,
      file,
      modelA?.capabilities.includes('vision') ?? false,
    )
    const messagesB = buildRunMessages(
      prompt,
      file,
      modelB?.capabilities.includes('vision') ?? false,
    )

    const [resultA, resultB] = await Promise.all([
      orIdA
        ? callModel(orIdA, messagesA)
        : callDirectProvider(comparison.model_a_slug, messagesA),
      orIdB
        ? callModel(orIdB, messagesB)
        : callDirectProvider(comparison.model_b_slug, messagesB),
    ])

    const promptHash = createHash('sha256').update(prompt).digest('hex')
    await updateComparisonPrompt(comparisonId, promptHash)

    const bothSucceeded =
      !resultA.error && !resultB.error &&
      Boolean(resultA.text?.trim()) && Boolean(resultB.text?.trim())
    if (bothSucceeded && !(await isUserAdmin(user.id))) {
      await incrementUserComparisons(user.id)
    }

    return {
      responseA: resultA.text,
      responseB: resultB.text,
      errorA: resultA.error,
      errorB: resultB.error,
    }
  } catch (error) {
    return comparisonRunFailure(error instanceof Error ? error.message : 'Failed to run comparison.')
  }
}

export async function submitPreference(
  comparisonId: string,
  preferred: 'model_a' | 'model_b' | 'tie',
  reason: string | null,
) {
  try {
    const user = await getCurrentUser()
    if (!user) return { error: 'You must be signed in.' }

    const comparison = await getComparison(comparisonId)
    if (!comparison) return { error: 'Comparison not found.' }
    if (comparison.user_id !== user.id) return { error: 'Not authorized.' }

    await updateComparisonPreference(comparisonId, preferred, reason)
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to submit preference.' }
  }
}
