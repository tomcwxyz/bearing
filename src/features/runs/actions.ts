'use server'

import { createHash } from 'crypto'

import { getCurrentUser } from '@/lib/auth'
import {
  addRoutedRunModel,
  createRoutedRun,
  getModelFromDb,
  getOpenRouterIdsBySlug,
  getRoutedRunCountToday,
  getTask,
  isUserAdmin,
  setRoutedRunVerdict,
} from '@/lib/db'
import { getLatestBenchmarkScores } from '@/lib/benchmarks'
import { filterPrompt } from '@/lib/content-filter'
import { extractText, validateFile } from '@/lib/file-parser'
import { pickInformationRoute } from '@/lib/information-routing'
import { judgeResponses, type JudgeCandidate } from '@/lib/judge'
import { callDirectProvider, callModel, DIRECT_PROVIDERS } from '@/lib/openrouter'
import { getAllModels, type Factor } from '@/lib/registry'
import { scoreModels } from '@/lib/scoring'
import { saveRoutedSelectionReasons } from '@/db/routed-selection'
import { buildRunMessages, type RunFileData } from './run-messages'

const DAILY_TRIO_LIMIT = 3
const DAILY_CHALLENGER_LIMIT = 4

function scoringInputFromTask(
  task: NonNullable<Awaited<ReturnType<typeof getTask>>>,
  benchmarkScores: Map<string, number> | undefined,
) {
  const priorityOrder: Factor[] = task.priority_order
    ? (typeof task.priority_order === 'string' ? JSON.parse(task.priority_order) : task.priority_order)
    : ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']

  const excludedFactors: string[] = task.excluded_factors
    ? (typeof task.excluded_factors === 'string' ? JSON.parse(task.excluded_factors) : task.excluded_factors)
    : []

  return {
    taskType: task.task_type,
    complexity: task.complexity,
    inputLength: task.input_length,
    needsVision: task.needs_vision,
    needsTools: task.needs_tools,
    needsCode: task.needs_code,
    needsReasoning: task.needs_reasoning ?? false,
    dataSensitivity: task.data_sensitivity ?? 'none',
    latencyTarget: task.latency_target ?? 'interactive',
    volume: task.volume ?? 'one_off',
    needsLongContext: task.needs_long_context ?? false,
    needsMultilingual: task.needs_multilingual ?? false,
    isAgentic: task.is_agentic ?? false,
    outputLength: task.output_length ?? 'medium',
    priorityOrder,
    excludedFactors,
    benchmarkScores,
  }
}

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
  const runnable = (slug: string) => orIds.has(slug) || Boolean(DIRECT_PROVIDERS[slug])
  const localSlugs = new Set(getAllModels().filter((model) => Boolean(model.local_info)).map((model) => model.slug))
  const anchorSlug = formData.get('modelSlug') as string | null

  const route = pickInformationRoute(ranked, {
    k,
    anchorSlug,
    runnable,
    isLocal: (slug) => localSlugs.has(slug),
  })

  return { route, orIds }
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
    const { route, orIds } = routeResult
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
      const output = openRouterId
        ? await callModel(openRouterId, messages)
        : await callDirectProvider(model.slug, messages)
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
      estCost: entry.model.estimatedCost,
      estCo2g: co2g(fullModels[index]),
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
    const { route, orIds } = routeResult
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
    const challengerResult = challengerOpenRouterId
      ? await callModel(challengerOpenRouterId, challengerMessages)
      : await callDirectProvider(challengerEntry.model.slug, challengerMessages)
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
        estCost: challengerEntry.model.estimatedCost,
        estCo2g: co2g(challengerModel),
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
