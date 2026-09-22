'use server'

import { createHash } from 'crypto'

import {
  addRoutedRunModel,
  createRoutedRun,
  getRoutedRun,
  getRoutedRunCountToday,
  setRoutedRunPreference,
} from '@/db/runs'
import { getModelFromDb, getOpenRouterIdsBySlug } from '@/db/models'
import { getTask } from '@/db/tasks'
import { isUserAdmin } from '@/db/users'
import { getCurrentUser } from '@/lib/auth'
import { getLatestBenchmarkScores } from '@/lib/benchmarks'
import { filterPrompt } from '@/lib/content-filter'
import { extractText, validateFile } from '@/lib/file-parser'
import { canExecuteHostedModel, runHostedExecution } from '@/lib/hosted-execution'
import { pickRoute, pickRouteFrom } from '@/lib/routing'
import { costFromTokenUsage, estimateCostFromPricing, scoreModels } from '@/lib/scoring'
import { scoringInputFromTask } from '@/features/recommendations/scoring-input'
import { originalRecommendationRank } from './route-metadata'
import { getOllamaCloudRoute, ollamaCloudPricing } from '@/lib/ollama-cloud'
import { saveExecutionObservation } from '@/db/execution-observations'
import { buildRunMessages, type RunFileData } from './run-messages'

const DAILY_ROUTE_LIMIT = 10

async function parseRunFile(formData: FormData): Promise<RunFileData | null | { error: string }> {
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

function co2g(model: Awaited<ReturnType<typeof getModelFromDb>>): number | null {
  return model?.sustainability.inference_energy_source?.raw_gwp_gco2eq ?? null
}

/** Run the selected recommendation (or the top runnable recommendation). */
export async function routeAndRun(taskId: string, formData: FormData) {
  try {
    const user = await getCurrentUser()
    if (!user) return { error: 'You must be signed in to run a prompt.' }

    const admin = await isUserAdmin(user.id)
    if (!admin && await getRoutedRunCountToday(user.id, 'route') >= DAILY_ROUTE_LIMIT) {
      return { error: `You've used your ${DAILY_ROUTE_LIMIT} daily runs.` }
    }

    const prompt = formData.get('prompt') as string
    if (!prompt?.trim()) return { error: 'Prompt is required.' }

    const filtered = await filterPrompt(prompt)
    if (!filtered.safe) return { error: filtered.reason || 'Prompt was flagged by content filter.' }

    const task = await getTask(taskId)
    if (!task) return { error: 'Task not found.' }

    const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
    const ranked = scoreModels(scoringInputFromTask(task, benchmarkScores))
    const orIds = await getOpenRouterIdsBySlug()
    const runnable = (slug: string) => canExecuteHostedModel(slug, orIds.get(slug))
    const anchorSlug = formData.get('modelSlug') as string | null
    const requestedExecutionRoute = formData.get('executionRoute') as string | null
    const route = anchorSlug
      ? pickRouteFrom(ranked, anchorSlug, { k: 1, runnable })
      : pickRoute(ranked, { k: 1, runnable })

    if (route.length === 0) {
      return {
        error: anchorSlug
          ? "This model isn't available to run directly."
          : 'No runnable model is available for this task.',
      }
    }

    const selected = route[0]
    const routeRank = originalRecommendationRank(ranked, selected.slug)
    const parsedFile = await parseRunFile(formData)
    if (parsedFile && 'error' in parsedFile) return parsedFile
    const file = parsedFile as RunFileData | null

    const openRouterId = orIds.get(selected.slug) ?? null
    const fullModel = await getModelFromDb(selected.slug)
    const messages = buildRunMessages(
      prompt,
      file,
      fullModel?.capabilities.includes('vision') ?? false,
    )

    const startedAt = Date.now()
    const result = await runHostedExecution(
      selected.slug,
      openRouterId,
      messages,
      requestedExecutionRoute,
    )
    const latencyMs = Date.now() - startedAt

    const promptHash = createHash('sha256').update(prompt).digest('hex')
    const responseHash = result.text?.trim()
      ? createHash('sha256').update(result.text).digest('hex')
      : null
    const estCo2g = co2g(fullModel)

    let executionCost = selected.estimatedCost
    if (result.route.id === 'ollama_cloud') {
      const cloudRoute = getOllamaCloudRoute(selected.slug)
      if (cloudRoute) {
        const pricing = ollamaCloudPricing(cloudRoute)
        executionCost =
          costFromTokenUsage(pricing, result.promptTokens, result.outputTokens)
          ?? estimateCostFromPricing(
            pricing,
            String(task.input_length ?? 'medium'),
            String(task.output_length ?? 'medium'),
          )
      }
    }

    const routedRunId = await createRoutedRun(taskId, user.id, 'route', promptHash)
    await addRoutedRunModel(routedRunId, {
      modelSlug: selected.slug,
      routeRank,
      weightedScore: selected.weightedScore,
      factorScores: selected.factorScores as Record<string, number>,
      role: 'primary',
      responseHash,
      estCost: executionCost,
      estCo2g,
      latencyMs,
      isError: Boolean(result.error),
      errorReason: result.error ?? null,
    })

    if (!result.error) {
      try {
        await saveExecutionObservation({
          taskId,
          routedRunId,
          modelSlug: selected.slug,
          executionLocation: result.route.id === 'ollama_cloud'
            ? 'external_hosted'
            : 'bearing_hosted',
          executionPurpose: 'task_execution',
          runtime: result.route.id,
          runtimeModelId: result.route.modelId,
          tokensPerSecond: result.tokensPerSecond,
          latencyMs,
          promptTokens: result.promptTokens,
          outputTokens: result.outputTokens,
          totalDurationMs: result.totalDurationMs,
          loadDurationMs: result.loadDurationMs,
          promptEvalDurationMs: result.promptEvalDurationMs,
          evidenceSource: 'bearing_run',
        })
      } catch (observationError) {
        console.warn('[route] execution observation could not be saved', observationError)
      }
    }

    return {
      routedRunId,
      modelSlug: selected.slug,
      modelName: selected.name,
      provider: selected.provider,
      executionProvider: result.route.provider,
      executionRoute: result.route.id,
      runtimeModelId: result.route.modelId,
      factorScores: selected.factorScores as Record<string, number>,
      response: result.text,
      error: result.error,
      estCost: executionCost,
      estCo2g,
      latencyMs,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to run prompt.' }
  }
}

/** Record the human preference for a routed experiment. */
export async function submitRoutedPreference(
  routedRunId: string,
  preferred: string,
  reason: string | null,
) {
  try {
    const user = await getCurrentUser()
    if (!user) return { error: 'You must be signed in.' }

    const run = await getRoutedRun(routedRunId)
    if (!run) return { error: 'Run not found.' }
    if (run.user_id !== user.id) return { error: 'Not authorized.' }

    await setRoutedRunPreference(routedRunId, preferred, reason)
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to submit preference.' }
  }
}
