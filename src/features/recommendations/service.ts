import { readFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'

import { getLatestBenchmarkScores } from '@/lib/benchmarks'
import { getTask, saveLocalRecommendations, saveRecommendations } from '@/lib/db'
import { scoreLocalModels } from '@/lib/local-inference'
import { scorePipeline, type PipelineResult } from '@/lib/pipeline'
import { generateReasoning } from '@/lib/reasoning'
import { getAllModels } from '@/lib/registry'
import { scoreModelsDetailed, type ScoredModel } from '@/lib/scoring'
import { scoringInputFromTask } from './scoring-input'

async function generatePipelineReasoning(
  taskType: string,
  pipeline: PipelineResult,
  topSingleModel: ScoredModel,
): Promise<string> {
  try {
    const promptPath = join(process.cwd(), 'src', 'prompts', 'pipeline-reason.md')
    const systemPrompt = readFileSync(promptPath, 'utf-8')

    const stagesSummary = pipeline.stages.map((stage) =>
      `Stage ${stage.stage}: ${stage.description} → ${stage.recommended.name} ($${stage.recommended.estimatedCost.toFixed(4)})`,
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

/**
 * Build and persist the recommendation result for a task.
 *
 * This is product/service logic rather than a server action: pages, API routes
 * and future decision-layer adapters can call the same operation without
 * importing the legacy action monolith.
 */
export async function getRecommendationResults(taskId: string) {
  try {
    const task = await getTask(taskId)
    if (!task) return { error: 'Task not found.' as const }

    const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
    const scoringInput = scoringInputFromTask(task, benchmarkScores)
    const { models, excluded } = scoreModelsDetailed(scoringInput)

    await saveRecommendations(
      taskId,
      models.map((model, index) => ({
        modelSlug: model.slug,
        rank: index + 1,
        weightedScore: model.weightedScore,
        factorScores: model.factorScores as Record<string, number>,
      })),
    )

    const reasoning = await generateReasoning(
      task.description_hash ?? '',
      task.task_type,
      models,
    )

    let pipeline: (PipelineResult & { reasoning: string }) | null = null
    if (task.pipeline_stages) {
      const stages = typeof task.pipeline_stages === 'string'
        ? JSON.parse(task.pipeline_stages)
        : task.pipeline_stages
      const pipelineResult = scorePipeline({
        stages,
        inputLength: task.input_length,
        priorityOrder: scoringInput.priorityOrder,
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

    const localResult = scoreLocalModels(models, getAllModels(), task.task_type)
    const local = localResult.recommendations.length > 0 ? localResult : null

    if (local) {
      await saveLocalRecommendations(
        taskId,
        local.recommendations.map((candidate, index) => ({
          modelSlug: candidate.model.slug,
          rank: index + 1,
          effectiveQuality: candidate.effectiveQuality,
          quant: candidate.bestQuant.quant,
          vramGb: candidate.bestQuant.vram_gb,
          qualityPenalty: candidate.bestQuant.quality_penalty,
          hardwareTierId: candidate.hardwareTier.id,
        })),
      )
    }

    return { task, models, reasoning, pipeline, local, excluded }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to get results.',
    }
  }
}
