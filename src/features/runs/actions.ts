'use server'

import { createHash } from 'crypto'

import {
  addRoutedRunModel,
  createRoutedRun,
  getRoutedRunCountToday,
  setRoutedRunVerdict,
} from '@/db/runs'
import { getModelFromDb, getOpenRouterIdsBySlug } from '@/db/models'
import { getTask } from '@/db/tasks'
import { isUserAdmin } from '@/db/users'
import { getCurrentUser } from '@/lib/auth'
import { getLatestBenchmarkScores } from '@/lib/benchmarks'
import { benchmarkEvidence, type BenchmarkEvidence } from '@/lib/benchmark-evidence'
import { filterPrompt } from '@/lib/content-filter'
import { extractText, validateFile } from '@/lib/file-parser'
import { pickInformationRoute } from '@/lib/information-routing'
import { outcomeInformationScarcity, type ModelOutcomeEvidence } from '@/lib/outcome-evidence'
import { judgeResponses, type JudgeCandidate } from '@/lib/judge'
import { canExecuteHostedModel, runHostedExecution, type HostedExecutionResult } from '@/lib/hosted-execution'
import { getAllModels } from '@/lib/registry'
import { costFromTokenUsage, estimateCostFromPricing, scoreModels } from '@/lib/scoring'
import { getBenchmarkAggregatesForModels } from '@/db/benchmark-evidence'
import { getOutcomeEvidenceForModels } from '@/db/outcome-evidence'
import { saveRoutedSelectionReasons } from '@/db/routed-selection'
import { scoringInputFromTask } from '@/features/recommendations/scoring-input'
import { buildRunMessages, type RunFileData } from './run-messages'
import { getOllamaCloudRoute, ollamaCloudPricing } from '@/lib/ollama-cloud'
import { saveExecutionObservation } from '@/db/execution-observations'

const DAILY_TRIO_LIMIT = 3
const DAILY_CHALLENGER_LIMIT = 4

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

async function buildInformationRoute(taskId: string, formData: FormData, k: number) {
  const task = await getTask(taskId)
  if (!task) return { error: 'Task not found.' as const }

  const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
  const ranked = scoreModels(scoringInputFromTask(task, benchmarkScores))
  const orIds = await getOpenRouterIdsBySlug()
  const runnable = (slug: string) => canExecuteHostedModel(slug, orIds.get(slug))
  const registryModels = getAllModels()
  const registryBySlug = new Map(registryModels.map((model) => [model.slug, model]))
  const localSlugs = new Set(registryModels.filter((model) => Boolean(model.local_info)).map((model) => model.slug))
  const anchorSlug = formData.get('modelSlug') as string | null

  let outcomeBySlug: Record<string, ModelOutcomeEvidence> | null = null
  try {
    outcomeBySlug = await getOutcomeEvidenceForModels({
      taskType: task.task_type,
      complexity: task.complexity,
      modelSlugs: ranked.map((model) => model.slug),
    })
  } catch (error) {
    console.warn('[runs] outcome evidence unavailable for experiment selection', error)
  }

  let benchmarkBySlug: Record<string, BenchmarkEvidence> | null = null
  try {
    const aggregates = await getBenchmarkAggregatesForModels(ranked.map((model) => model.slug))
    benchmarkBySlug = Object.fromEntries(ranked.map((model) => [
      model.slug,
      benchmarkEvidence({
        curatedScore: registryBySlug.get(model.slug)?.task_fitness[task.task_type],
        aggregate: aggregates.get(`${model.slug}::${task.task_type}`),
      }),
    ]))
  } catch (error) {
    console.warn('[runs] benchmark evidence unavailable for experiment selection', error)
  }

  const route = pickInformationRoute(ranked, {
    k,
    anchorSlug,
    runnable,
    isLocal: (slug) => localSlugs.has(slug),
    ...(outcomeBySlug
      ? { outcomeScarcity: (slug: string) => outcomeInformationScarcity(outcomeBySlug?.[slug]) }
      : {}),
    ...(benchmarkBySlug
      ? { benchmarkUncertainty: (slug: string) => benchmarkBySlug?.[slug]?.uncertainty ?? 0 }
      : {}),
  })

  return { route, orIds, task }
}

function executionCostForRoute(
  modelEstimatedCost: number,
  task: Record<string, unknown>,
  modelSlug: string,
  result: HostedExecutionResult,
): number {
  if (result.route.id !== 'ollama_cloud') return modelEstimatedCost
  const cloudRoute = getOllamaCloudRoute(modelSlug)
  if (!cloudRoute) return modelEstimatedCost

  const pricing = ollamaCloudPricing(cloudRoute)
  return costFromTokenUsage(pricing, result.promptTokens, result.outputTokens)
    ?? estimateCostFromPricing(
      pricing,
      String(task.input_length ?? 'medium'),
      String(task.output_length ?? 'medium'),
    )
}

async function recordHostedObservation(input: {
  taskId: string
  routedRunId: string
  modelSlug: string
  result: HostedExecutionResult
  latencyMs: number
}) {
  if (input.result.error) return
  try {
    await saveExecutionObservation({
      taskId: input.taskId,
      routedRunId: input.routedRunId,
      modelSlug: input.modelSlug,
      executionLocation: input.result.route.id === 'ollama_cloud'
        ? 'external_hosted'
        : 'bearing_hosted',
      executionPurpose: 'task_execution',
      runtime: input.result.route.id,
      runtimeModelId: input.result.route.modelId,
      tokensPerSecond: input.result.tokensPerSecond,
      latencyMs: input.latencyMs,
      promptTokens: input.result.promptTokens,
      outputTokens: input.result.outputTokens,
      totalDurationMs: input.result.totalDurationMs,
      loadDurationMs: input.result.loadDurationMs,
      promptEvalDurationMs: input.result.promptEvalDurationMs,
      evidenceSource: 'bearing_run',
    })
  } catch (error) {
    console.warn('[runs] execution observation could not be saved', error)
  }
}

async function judge(
  prompt: string,
  candidates: Array<{ slug: string; name: string; response?: string; error?: string }>,
) {
  const judgeable: JudgeCandidate[] = candidates
    .filter((candidate) => !candidate.error && candidate.response?.trim())
    .map((candidate) => ({ id: candidate.slug, text: candidate.response! }))

  if (judgeable.length < 2) return null

  try {
    const verdict = await judgeResponses(prompt, judgeable)
    const winner = candidates.find((candidate) => candidate.slug === verdict.winnerId)
    return {
      winnerSlug: verdict.winnerId,
      winnerName: winner?.name ?? verdict.winnerId,
      reason: verdict.reason,
      judgeModel: verdict.judgeModel,
    }
  } catch (error) {
    console.error('Routed experiment judge failed:', error)
    return null
  }
}

export async function runInformationTrio(taskId: string, formData: FormData) {
  try {
    const user = await getCurrentUser()
    if (!user) return { error: 'You must be signed in to run a comparison.' }

    const admin = await isUserAdmin(user.id)
    if (!admin && await getRoutedRunCountToday(user.id, 'trio') >= DAILY_TRIO_LIMIT) {
      return { error: `You've used your ${DAILY_TRIO_LIMIT} daily Trio runs.` }
    }

    const prompt = formData.get('prompt') as string
    if (!prompt?.trim()) return { error: 'Prompt is required.' }

    const filtered = await filterPrompt(prompt)
    if (!filtered.safe) return { error: filtered.reason || 'Prompt was flagged by content filter.' }

    const routeResult = await buildInformationRoute(taskId, formData, 3)
    if ('error' in routeResult) return routeResult
    const { route, orIds, task } = routeResult
    if (route.length < 2) return { error: 'Not enough runnable models for an informative Trio.' }

    const parsedFile = await parseRunFile(formData)
    if (parsedFile && 'error' in parsedFile) return parsedFile
    const file = parsedFile as RunFileData | null

    const fullModels = await Promise.all(route.map((entry) => getModelFromDb(entry.model.slug)))
    const timedOutputs = await Promise.all(route.map(async (entry, index) => {
      const model = entry.model
      const openRouterId = orIds.get(model.slug) ?? null
      const messages = buildRunMessages(
        prompt,
        file,
        fullModels[index]?.capabilities.includes('vision') ?? false,
      )
      const startedAt = Date.now()
      const output = await runHostedExecution(
        model.slug,
        openRouterId,
        messages,
        index === 0 ? formData.get('executionRoute') as string | null : null,
      )
      return { output, latencyMs: Date.now() - startedAt }
    }))

    const candidates = route.map((entry, index) => ({
      slug: entry.model.slug,
      name: entry.model.name,
      provider: entry.model.provider,
      routeRank: entry.recommendationRank,
      role: index === 0 ? 'primary' as const : 'candidate' as const,
      selectionReason: entry.selectionReason,
      weightedScore: entry.model.weightedScore,
      factorScores: entry.model.factorScores as Record<string, number>,
      estCost: executionCostForRoute(
        entry.model.estimatedCost,
        task as Record<string, unknown>,
        entry.model.slug,
        timedOutputs[index].output,
      ),
      estCo2g: co2g(fullModels[index]),
      executionProvider: timedOutputs[index].output.route.provider,
      executionRoute: timedOutputs[index].output.route.id,
      runtimeModelId: timedOutputs[index].output.route.modelId,
      response: timedOutputs[index].output.text,
      error: timedOutputs[index].output.error,
      latencyMs: timedOutputs[index].latencyMs,
      reused: false,
    }))

    const verdict = await judge(prompt, candidates)
    const promptHash = createHash('sha256').update(prompt).digest('hex')
    const routedRunId = await createRoutedRun(taskId, user.id, 'trio', promptHash)

    await Promise.all(candidates.map((candidate) => addRoutedRunModel(routedRunId, {
      modelSlug: candidate.slug,
      routeRank: candidate.routeRank,
      weightedScore: candidate.weightedScore,
      factorScores: candidate.factorScores,
      role: candidate.role,
      responseHash: candidate.response?.trim()
        ? createHash('sha256').update(candidate.response).digest('hex')
        : null,
      estCost: candidate.estCost,
      estCo2g: candidate.estCo2g,
      latencyMs: candidate.latencyMs,
      isError: Boolean(candidate.error),
      errorReason: candidate.error ?? null,
    })))

    await saveRoutedSelectionReasons(routedRunId, candidates.map((candidate) => ({
      modelSlug: candidate.slug,
      selectionReason: candidate.selectionReason,
    })))

    await Promise.all(candidates.map((candidate, index) =>
      recordHostedObservation({
        taskId,
        routedRunId,
        modelSlug: candidate.slug,
        result: timedOutputs[index].output,
        latencyMs: timedOutputs[index].latencyMs,
      }),
    ))

    await recordHostedObservation({
      taskId,
      routedRunId,
      modelSlug: challengerEntry.model.slug,
      result: challengerResult,
      latencyMs: challengerLatencyMs,
    })

    if (verdict) await setRoutedRunVerdict(routedRunId, verdict.winnerSlug, verdict.judgeModel)

    return {
      routedRunId,
      candidates: candidates.map(({ weightedScore: _weightedScore, factorScores: _factorScores, latencyMs: _latencyMs, ...candidate }) => candidate),
      verdict,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to run Trio.' }
  }
}

export async function challengeAnswer(taskId: string, formData: FormData) {
  try {
    const user = await getCurrentUser()
    if (!user) return { error: 'You must be signed in to challenge an answer.' }

    const admin = await isUserAdmin(user.id)
    if (!admin && await getRoutedRunCountToday(user.id, 'challenger') >= DAILY_CHALLENGER_LIMIT) {
      return { error: `You've used your ${DAILY_CHALLENGER_LIMIT} daily Challenger runs.` }
    }

    const prompt = formData.get('prompt') as string
    const primaryResponse = formData.get('primaryResponse') as string
    if (!prompt?.trim()) return { error: 'Prompt is required.' }
    if (!primaryResponse?.trim()) return { error: 'There is no answer to challenge yet.' }

    const filtered = await filterPrompt(prompt)
    if (!filtered.safe) return { error: filtered.reason || 'Prompt was flagged by content filter.' }

    const routeResult = await buildInformationRoute(taskId, formData, 2)
    if ('error' in routeResult) return routeResult
    const { route, orIds, task } = routeResult
    if (route.length < 2) return { error: 'No strong runnable alternative is available to challenge this answer.' }

    const [primaryEntry, challengerEntry] = route
    const challengerModel = await getModelFromDb(challengerEntry.model.slug)

    const parsedFile = await parseRunFile(formData)
    if (parsedFile && 'error' in parsedFile) return parsedFile
    const file = parsedFile as RunFileData | null

    const challengerInstruction = [
      'A user made the following request:',
      `"""${prompt}"""`,
      '',
      'Another AI model produced this answer:',
      `"""${primaryResponse}"""`,
      '',
      'Challenge this answer constructively. Identify material gaps, errors or assumptions, then provide your own improved answer. Do not disagree merely for the sake of disagreement.',
    ].join('\n\n')

    const challengerOpenRouterId = orIds.get(challengerEntry.model.slug) ?? null
    const challengerMessages = buildRunMessages(
      challengerInstruction,
      file,
      challengerModel?.capabilities.includes('vision') ?? false,
    )
    const startedAt = Date.now()
    const challengerResult = await runHostedExecution(
      challengerEntry.model.slug,
      challengerOpenRouterId,
      challengerMessages,
    )
    const challengerLatencyMs = Date.now() - startedAt

    const candidates = [
      {
        slug: primaryEntry.model.slug,
        name: primaryEntry.model.name,
        provider: primaryEntry.model.provider,
        routeRank: primaryEntry.recommendationRank,
        role: 'primary' as const,
        selectionReason: 'Existing answer being challenged',
        weightedScore: primaryEntry.model.weightedScore,
        factorScores: primaryEntry.model.factorScores as Record<string, number>,
        estCost: 0,
        estCo2g: null,
        response: primaryResponse,
        error: undefined as string | undefined,
        latencyMs: 0,
        reused: true,
      },
      {
        slug: challengerEntry.model.slug,
        name: challengerEntry.model.name,
        provider: challengerEntry.model.provider,
        routeRank: challengerEntry.recommendationRank,
        role: 'challenger' as const,
        selectionReason: challengerEntry.selectionReason,
        weightedScore: challengerEntry.model.weightedScore,
        factorScores: challengerEntry.model.factorScores as Record<string, number>,
        estCost: executionCostForRoute(
          challengerEntry.model.estimatedCost,
          task as Record<string, unknown>,
          challengerEntry.model.slug,
          challengerResult,
        ),
        estCo2g: co2g(challengerModel),
        executionProvider: challengerResult.route.provider,
        executionRoute: challengerResult.route.id,
        runtimeModelId: challengerResult.route.modelId,
        response: challengerResult.text,
        error: challengerResult.error,
        latencyMs: challengerLatencyMs,
        reused: false,
      },
    ]

    const verdict = await judge(prompt, candidates)
    const promptHash = createHash('sha256').update(prompt).digest('hex')
    const routedRunId = await createRoutedRun(taskId, user.id, 'challenger', promptHash)

    await Promise.all(candidates.map((candidate) => addRoutedRunModel(routedRunId, {
      modelSlug: candidate.slug,
      routeRank: candidate.routeRank,
      weightedScore: candidate.weightedScore,
      factorScores: candidate.factorScores,
      role: candidate.role,
      responseHash: candidate.response?.trim()
        ? createHash('sha256').update(candidate.response).digest('hex')
        : null,
      estCost: candidate.estCost,
      estCo2g: candidate.estCo2g,
      latencyMs: candidate.latencyMs,
      isError: Boolean(candidate.error),
      errorReason: candidate.error ?? null,
    })))

    await saveRoutedSelectionReasons(routedRunId, candidates.map((candidate) => ({
      modelSlug: candidate.slug,
      selectionReason: candidate.selectionReason,
    })))

    if (verdict) await setRoutedRunVerdict(routedRunId, verdict.winnerSlug, verdict.judgeModel)

    return {
      routedRunId,
      candidates: candidates.map(({ weightedScore: _weightedScore, factorScores: _factorScores, latencyMs: _latencyMs, ...candidate }) => candidate),
      verdict,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to challenge answer.' }
  }
}
