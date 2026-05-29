'use server'

import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { createHash } from 'crypto'
import { neon } from '@neondatabase/serverless'

import { sendMagicLink, getCurrentUser } from '@/lib/auth'
import { classifyTask, type ClarificationAnswer } from '@/lib/classification'
import { readFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { scoreModels, scoreModelsDetailed, type ScoredModel, type Exclusion } from '@/lib/scoring'
import { getLatestBenchmarkScores } from '@/lib/benchmarks'
import { generateReasoning } from '@/lib/reasoning'
import { scorePipeline, type PipelineResult } from '@/lib/pipeline'
import {
  createTask,
  updateTaskPriorities,
  getTask,
  saveRecommendations,
  saveLocalRecommendations,
  saveSelection,
  saveOutcome,
  createComparison,
  updateComparisonPrompt,
  updateComparisonPreference,
  getUserComparisonCount,
  incrementUserComparisons,
  getComparison,
  getOpenRouterId,
  getModelFromDb,
} from '@/lib/db'
import { callModel, callDirectProvider, DIRECT_PROVIDERS } from '@/lib/openrouter'
import { filterPrompt } from '@/lib/content-filter'
import { validateFile, extractText, fileToBase64DataUrl } from '@/lib/file-parser'
import { getAllModels, type Factor } from '@/lib/registry'
import { scoreLocalModels } from '@/lib/local-inference'

// ---------------------------------------------------------------------------
// 1. submitTask
// ---------------------------------------------------------------------------

export async function submitTask(formData: FormData) {
  try {
    const description = formData.get('description')
    if (!description || typeof description !== 'string' || !description.trim()) {
      return { error: 'Description is required.' }
    }

    const trimmed = description.trim()
    const classification = await classifyTask(trimmed)

    const descriptionHash = createHash('sha256')
      .update(trimmed.toLowerCase())
      .digest('hex')

    const taskId = await createTask({
      descriptionHash,
      taskType: classification.task_type,
      taskSubtype: classification.task_subtype ?? undefined,
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
      classificationConfidence: classification.confidence,
      pipelineStages: classification.pipeline_stages ?? null,
    })

    if (classification.confidence < 0.6 || classification.clarification_needed) {
      return {
        taskId,
        needsClarification: true,
        questions: classification.suggested_questions,
        description: trimmed,
      }
    }

    redirect(`/recommend/${taskId}/priorities`)
  } catch (error) {
    // redirect() throws a special Next.js error — re-throw it
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit task.' }
  }
}

// ---------------------------------------------------------------------------
// 2. submitClarification
// ---------------------------------------------------------------------------

export async function submitClarification(
  taskId: string,
  description: string,
  clarifications: ClarificationAnswer[],
) {
  try {
    const classification = await classifyTask(description, clarifications)

    const sql = neon(process.env.NEON_DATABASE_URL!)
    await sql`
      UPDATE tasks
      SET
        task_type = ${classification.task_type},
        task_subtype = ${classification.task_subtype ?? null},
        complexity = ${classification.complexity},
        input_length = ${classification.input_length},
        needs_vision = ${classification.needs_vision},
        needs_tools = ${classification.needs_tools},
        needs_code = ${classification.needs_code},
        needs_reasoning = ${classification.needs_reasoning},
        is_recurring = ${classification.is_recurring},
        data_sensitivity = ${classification.data_sensitivity},
        latency_target = ${classification.latency_target},
        volume = ${classification.volume},
        needs_long_context = ${classification.needs_long_context},
        needs_multilingual = ${classification.needs_multilingual},
        is_agentic = ${classification.is_agentic},
        output_length = ${classification.output_length},
        classification_confidence = ${classification.confidence},
        pipeline_stages = ${classification.pipeline_stages ? JSON.stringify(classification.pipeline_stages) : null}
      WHERE id = ${taskId}
    `

    if (classification.confidence < 0.6 || classification.clarification_needed) {
      return {
        needsClarification: true,
        questions: classification.suggested_questions,
      }
    }

    redirect(`/recommend/${taskId}/priorities`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit clarification.' }
  }
}

// ---------------------------------------------------------------------------
// 3. submitPriorities
// ---------------------------------------------------------------------------

export async function submitPriorities(taskId: string, priorityOrder: Factor[], excludedFactors?: string[]) {
  try {
    await updateTaskPriorities(taskId, priorityOrder, excludedFactors ?? [])
    redirect(`/recommend/${taskId}/results`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit priorities.' }
  }
}

// ---------------------------------------------------------------------------
// 4. getResults
// ---------------------------------------------------------------------------

export async function getResults(taskId: string) {
  try {
    const task = await getTask(taskId)
    if (!task) {
      return { error: 'Task not found.' }
    }

    const priorityOrder: Factor[] = task.priority_order
      ? (typeof task.priority_order === 'string'
          ? JSON.parse(task.priority_order)
          : task.priority_order)
      : ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']

    const excludedFactors: string[] = task.excluded_factors
      ? (typeof task.excluded_factors === 'string'
          ? JSON.parse(task.excluded_factors)
          : task.excluded_factors)
      : []

    const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
    const { models, excluded } = scoreModelsDetailed({
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
    })

    const recommendationsForDb = models.map((m, i) => ({
      modelSlug: m.slug,
      rank: i + 1,
      weightedScore: m.weightedScore,
      factorScores: m.factorScores as Record<string, number>,
    }))
    await saveRecommendations(taskId, recommendationsForDb)

    const reasoning = await generateReasoning(
      task.description_hash ?? '',
      task.task_type,
      models,
    )

    // Pipeline recommendations if classification detected multi-stage task
    let pipeline: (PipelineResult & { reasoning: string }) | null = null
    if (task.pipeline_stages) {
      const stages = typeof task.pipeline_stages === 'string'
        ? JSON.parse(task.pipeline_stages)
        : task.pipeline_stages
      const pipelineResult = scorePipeline({
        stages,
        inputLength: task.input_length,
        priorityOrder,
        needsReasoning: task.needs_reasoning ?? false,
        dataSensitivity: task.data_sensitivity ?? 'none',
        latencyTarget: task.latency_target ?? 'interactive',
        volume: task.volume ?? 'one_off',
        needsLongContext: task.needs_long_context ?? false,
        needsMultilingual: task.needs_multilingual ?? false,
        isAgentic: task.is_agentic ?? false,
        outputLength: task.output_length ?? 'medium',
      })
      const pipelineReasoning = await generatePipelineReasoning(
        task.task_type,
        pipelineResult,
        models[0],
      )
      pipeline = { ...pipelineResult, reasoning: pipelineReasoning }
    }

    // Local inference recommendations for open-weight models
    const allModelsRaw = getAllModels()
    const localResult = scoreLocalModels(models, allModelsRaw, task.task_type)
    const local = localResult.recommendations.length > 0 ? localResult : null

    // Persist the local-rec set so the public dataset can answer "what local
    // model would Bearing have suggested for this task?". Matches the
    // recommendations pattern (overwrite-by-append; dataset DISTINCTs to the
    // latest set per task). Zero recs = no row, which is itself a signal.
    if (local) {
      await saveLocalRecommendations(
        taskId,
        local.recommendations.map((c, i) => ({
          modelSlug: c.model.slug,
          rank: i + 1,
          effectiveQuality: c.effectiveQuality,
          quant: c.bestQuant.quant,
          vramGb: c.bestQuant.vram_gb,
          qualityPenalty: c.bestQuant.quality_penalty,
          hardwareTierId: c.hardwareTier.id,
        })),
      )
    }

    return { task, models, reasoning, pipeline, local, excluded }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to get results.' }
  }
}

// ---------------------------------------------------------------------------
// 5. selectModel
// ---------------------------------------------------------------------------

export async function selectModel(taskId: string, modelSlug: string, rank: number) {
  try {
    const selectionId = await saveSelection(taskId, modelSlug, rank)
    return { selectionId }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to select model.' }
  }
}

// ---------------------------------------------------------------------------
// 6. submitOutcome
// ---------------------------------------------------------------------------

export async function submitOutcome(
  taskId: string,
  selectionId: string,
  success: boolean,
  failureReason: string | null,
  feedback: string | null,
) {
  try {
    await saveOutcome(taskId, selectionId, success, failureReason, feedback)
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to submit outcome.' }
  }
}

// ---------------------------------------------------------------------------
// 7. submitValidation
// ---------------------------------------------------------------------------

export async function submitValidation(formData: FormData) {
  try {
    const modelSlug = formData.get('modelSlug') as string
    const description = formData.get('description') as string

    if (!modelSlug?.trim() || !description?.trim()) {
      return { error: 'Please provide both a model and task description.' }
    }

    const classification = await classifyTask(description.trim())

    const descriptionHash = createHash('sha256')
      .update(description.trim().toLowerCase())
      .digest('hex')

    const taskId = await createTask({
      descriptionHash,
      taskType: classification.task_type,
      taskSubtype: classification.task_subtype ?? undefined,
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
      mode: 'validate',
      classificationConfidence: classification.confidence,
    })

    // Use default priorities for validate mode
    const defaultPriorities: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    await updateTaskPriorities(taskId, defaultPriorities)

    redirect(`/validate/${taskId}/results?model=${encodeURIComponent(modelSlug)}`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit validation.' }
  }
}

// ---------------------------------------------------------------------------
// 7b. getModelsForCompare — all models available for comparison
// ---------------------------------------------------------------------------

export async function getModelsForCompare() {
  try {
    const { getAllModelsFromDb } = await import('@/lib/db')
    const models = await getAllModelsFromDb()
    return {
      models: models.map(m => ({
        slug: m.slug,
        name: m.name,
        provider: m.provider,
        tier: m.tier,
        capabilities: m.capabilities,
        contextWindow: m.context_window,
      })),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to load models.' }
  }
}

// ---------------------------------------------------------------------------
// 8. requestMagicLink
// ---------------------------------------------------------------------------

export async function requestMagicLink(email: string, redirect?: string) {
  if (!email?.trim()) return { error: 'Email is required.' }

  const result = await sendMagicLink(email.trim(), redirect)
  if (!result.success) return { error: result.error || 'Failed to send magic link.' }

  return { success: true, email: email.trim() }
}

// ---------------------------------------------------------------------------
// 9. getValidationResults
// ---------------------------------------------------------------------------

export async function getValidationResults(taskId: string, currentModelSlug: string) {
  try {
    const task = await getTask(taskId)
    if (!task) return { error: 'Task not found.' }

    const priorityOrder: Factor[] = task.priority_order
      ? (typeof task.priority_order === 'string' ? JSON.parse(task.priority_order) : task.priority_order)
      : ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']

    const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
    const models = scoreModels({
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
      benchmarkScores,
    })

    // Find the current model's position
    const currentModelIndex = models.findIndex(m => m.slug === currentModelSlug)
    const currentModel = currentModelIndex >= 0 ? models[currentModelIndex] : null
    const currentModelRank = currentModelIndex >= 0 ? currentModelIndex + 1 : null

    // Determine assessment
    let assessment: 'good_fit' | 'overpaying' | 'better_options'
    if (!currentModel) {
      assessment = 'better_options' // model not in registry or excluded by capabilities
    } else if (currentModelRank === 1) {
      assessment = 'good_fit'
    } else if (currentModelRank! <= 3 && currentModel.factorScores.cost < 0.5) {
      assessment = 'overpaying' // ranked ok but expensive
    } else if (currentModelRank! <= 3) {
      assessment = 'good_fit'
    } else {
      assessment = 'better_options'
    }

    return { task, models, currentModel, currentModelRank, assessment }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to get validation results.' }
  }
}

// ---------------------------------------------------------------------------
// Embedding mode — v0.9
// ---------------------------------------------------------------------------
//
// Unlike /recommend, /embedding does not need an LLM classification step:
// the form fields map directly onto task params (task_type is always
// 'embedding', the other fields constrain capability + priority). Persist
// the task + recommendations so the row shows up in the public dataset
// alongside chat-task selections.

export interface EmbeddingFormInput {
  useCase: 'retrieval' | 'similarity' | 'classification' | 'clustering' | 'dedup' | 'other'
  inputSize: 'short' | 'medium' | 'long'
  hosting: 'hosted' | 'open' | 'no_preference'
  languages: 'english' | 'few' | 'many'
  latency: 'any' | 'interactive' | 'realtime'
}

function embeddingPriorityFor(hosting: EmbeddingFormInput['hosting']): Factor[] {
  // Default ordering: quality dominates because MTEB is the single best
  // signal; cost / speed / capability follow; privacy / transparency /
  // sustainability bring up the rear (they matter less for a stateless
  // vector job). Hosting preference reshuffles privacy + transparency up
  // when the user explicitly wants open / self-hosted.
  if (hosting === 'open') {
    return ['quality', 'transparency', 'privacy', 'sustainability', 'cost', 'speed', 'capability']
  }
  if (hosting === 'hosted') {
    return ['quality', 'speed', 'cost', 'capability', 'privacy', 'sustainability', 'transparency']
  }
  return ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']
}

export async function submitEmbeddingTask(input: EmbeddingFormInput) {
  try {
    const priorityOrder = embeddingPriorityFor(input.hosting)

    // Map the long-input case onto our 4-bucket scale so the cost estimator
    // and (future) context-window filter resolve correctly.
    const inputLength = input.inputSize === 'long' ? 'very_long' : input.inputSize

    // Encode hosting=open as on_prem_required so the scoring hard filter
    // routes to embedding models with local_info populated (BGE-M3, Nomic,
    // GTE-Qwen2-7B). hosting=hosted leaves data_sensitivity at 'none'.
    const dataSensitivity = input.hosting === 'open' ? 'on_prem_required' : 'none'

    const taskId = await createTask({
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
      latencyTarget: input.latency === 'any' ? 'batch' : input.latency,
      volume: 'one_off',
      needsLongContext: false, // embedding models use max_input_tokens, not context_window — this filter doesn't apply
      needsMultilingual: input.languages !== 'english',
      isAgentic: false,
      outputLength: 'short', // vectors are tiny relative to chat output
      mode: 'embedding',
      priorityOrder,
      classificationConfidence: 1.0, // direct form input, not an LLM guess
      pipelineStages: null,
    })

    // Score now so the row persists with recommendations attached. We use
    // scoreModelsDetailed (not scoreModels) so excluded reasons could be
    // surfaced if we later add UI for them.
    const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
    const { models } = scoreModelsDetailed({
      taskType: 'embedding',
      complexity: 'simple',
      inputLength,
      needsVision: false,
      needsTools: false,
      needsCode: false,
      needsReasoning: false,
      dataSensitivity,
      latencyTarget: input.latency === 'any' ? 'batch' : input.latency,
      volume: 'one_off',
      needsLongContext: false, // embedding models use max_input_tokens, not context_window — this filter doesn't apply
      needsMultilingual: input.languages !== 'english',
      isAgentic: false,
      outputLength: 'short',
      priorityOrder,
      benchmarkScores,
    })

    await saveRecommendations(
      taskId,
      models.map((m, i) => ({
        modelSlug: m.slug,
        rank: i + 1,
        weightedScore: m.weightedScore,
        factorScores: m.factorScores as Record<string, number>,
      })),
    )

    redirect(`/embedding/${taskId}/results`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to find embedding models.' }
  }
}

export async function getEmbeddingResults(taskId: string) {
  try {
    const task = await getTask(taskId)
    if (!task) return { error: 'Task not found.' }
    if (task.task_type !== 'embedding') {
      return { error: 'This task is not an embedding task.' }
    }

    const priorityOrder: Factor[] = task.priority_order
      ? (typeof task.priority_order === 'string'
          ? JSON.parse(task.priority_order)
          : task.priority_order)
      : ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']

    const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
    const { models } = scoreModelsDetailed({
      taskType: 'embedding',
      complexity: task.complexity ?? 'simple',
      inputLength: task.input_length ?? 'medium',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      dataSensitivity: task.data_sensitivity ?? 'none',
      latencyTarget: task.latency_target ?? 'batch',
      volume: 'one_off',
      needsLongContext: task.needs_long_context ?? false,
      needsMultilingual: task.needs_multilingual ?? false,
      isAgentic: false,
      outputLength: 'short',
      priorityOrder,
      benchmarkScores,
    })

    return {
      task: {
        task_type: task.task_type as string,
        task_subtype: task.task_subtype as string | null,
      },
      models,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to load embedding results.' }
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Pipeline reasoning helper
// ---------------------------------------------------------------------------

async function generatePipelineReasoning(
  taskType: string,
  pipeline: PipelineResult,
  topSingleModel: ScoredModel,
): Promise<string> {
  try {
    const promptPath = join(process.cwd(), 'src', 'prompts', 'pipeline-reason.md')
    const systemPrompt = readFileSync(promptPath, 'utf-8')

    const stagesSummary = pipeline.stages.map(s =>
      `Stage ${s.stage}: ${s.description} → ${s.recommended.name} ($${s.recommended.estimatedCost.toFixed(4)})`
    ).join('\n')

    const userMessage = [
      `Task type: ${taskType}`,
      `Top single model: ${topSingleModel.name} ($${topSingleModel.estimatedCost.toFixed(4)})`,
      `Pipeline stages:\n${stagesSummary}`,
      `Pipeline total cost: $${pipeline.totalEstimatedCost.toFixed(4)}`,
    ].join('\n')

    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    return response.content[0].type === 'text' ? response.content[0].text : ''
  } catch {
    return 'A pipeline of specialist models may handle this task more efficiently than a single model.'
  }
}

// ---------------------------------------------------------------------------
// 9b. createDirectCompareTask — lightweight task for direct compare (no classification)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 10. startComparison
// ---------------------------------------------------------------------------

export async function startComparison(
  taskId: string,
  modelASlug: string,
  modelBSlug: string,
) {
  try {
    const user = await getCurrentUser()
    if (!user) return { error: 'You must be signed in to compare models.' }

    const today = new Date().toISOString().slice(0, 10)
    const { count, date } = await getUserComparisonCount(user.id)

    if (date === today && count >= 2) {
      return { error: "You've used your 2 daily comparisons" }
    }

    const comparisonId = await createComparison(taskId, user.id, modelASlug, modelBSlug)
    return { comparisonId }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to start comparison.' }
  }
}

// ---------------------------------------------------------------------------
// 11. runComparison
// ---------------------------------------------------------------------------

// Build chat messages for a model, handling file attachments
function buildCompareMessages(
  prompt: string,
  file: { buffer: Buffer; mimeType: string; name: string; extractedText: string } | null,
  hasVision: boolean,
): Array<{ role: string; content: string | Array<{ type: string; [key: string]: unknown }> }> {
  if (!file) {
    return [{ role: 'user', content: prompt }]
  }

  // Vision model + PDF: send as multimodal base64
  if (hasVision && (file.mimeType === 'application/pdf' || file.name.endsWith('.pdf'))) {
    return [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: fileToBase64DataUrl(file.buffer, file.mimeType) } },
        { type: 'text', text: prompt },
      ],
    }]
  }

  // Text-only fallback: prepend extracted content
  const contextPrompt = `Document content:\n\n${file.extractedText}\n\n---\n\nUser request: ${prompt}`
  return [{ role: 'user', content: contextPrompt }]
}

export async function runComparison(comparisonId: string, formData: FormData) {
  try {
    const user = await getCurrentUser()
    if (!user) return { error: 'You must be signed in to compare models.' }

    const comparison = await getComparison(comparisonId)
    if (!comparison) return { error: 'Comparison not found.' }
    if (comparison.user_id !== user.id) return { error: 'Not authorized.' }

    const prompt = formData.get('prompt') as string
    if (!prompt?.trim()) return { error: 'Prompt is required.' }

    // Content filter on text prompt
    const filterResult = await filterPrompt(prompt)
    if (!filterResult.safe) {
      return { error: filterResult.reason || 'Prompt was flagged by content filter.' }
    }

    // Handle optional file attachment
    let fileData: { buffer: Buffer; mimeType: string; name: string; extractedText: string } | null = null
    const uploadedFile = formData.get('file') as File | null
    if (uploadedFile && uploadedFile.size > 0) {
      const validation = validateFile(uploadedFile.name, uploadedFile.type, uploadedFile.size)
      if (!validation.valid) return { error: validation.error }

      const buffer = Buffer.from(await uploadedFile.arrayBuffer())
      const extractedText = await extractText(buffer, uploadedFile.type, uploadedFile.name)
      fileData = { buffer, mimeType: uploadedFile.type, name: uploadedFile.name, extractedText }
    }

    // Look up model details and routing info
    const [orIdA, orIdB, modelA, modelB] = await Promise.all([
      getOpenRouterId(comparison.model_a_slug),
      getOpenRouterId(comparison.model_b_slug),
      getModelFromDb(comparison.model_a_slug),
      getModelFromDb(comparison.model_b_slug),
    ])

    const directA = DIRECT_PROVIDERS[comparison.model_a_slug]
    const directB = DIRECT_PROVIDERS[comparison.model_b_slug]

    if (!orIdA && !directA) return { error: `Model ${comparison.model_a_slug} is not available for comparison.` }
    if (!orIdB && !directB) return { error: `Model ${comparison.model_b_slug} is not available for comparison.` }

    const hasVisionA = modelA?.capabilities.includes('vision') ?? false
    const hasVisionB = modelB?.capabilities.includes('vision') ?? false

    // Build per-model messages and call both in parallel
    const messagesA = buildCompareMessages(prompt, fileData, hasVisionA)
    const messagesB = buildCompareMessages(prompt, fileData, hasVisionB)

    const [resultA, resultB] = await Promise.all([
      orIdA ? callModel(orIdA, messagesA) : callDirectProvider(comparison.model_a_slug, messagesA),
      orIdB ? callModel(orIdB, messagesB) : callDirectProvider(comparison.model_b_slug, messagesB),
    ])

    // Hash the prompt and store
    const promptHash = createHash('sha256').update(prompt).digest('hex')
    await updateComparisonPrompt(comparisonId, promptHash)

    // Increment daily count
    await incrementUserComparisons(user.id)

    return {
      responseA: resultA.text,
      responseB: resultB.text,
      errorA: resultA.error,
      errorB: resultB.error,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to run comparison.' }
  }
}

// ---------------------------------------------------------------------------
// 12. submitPreference
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 13. checkAuth
// ---------------------------------------------------------------------------

export async function checkAuth() {
  const user = await getCurrentUser()
  return { authenticated: !!user }
}
