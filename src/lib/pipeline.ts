import { type Factor } from './registry'
import { scoreModels, type ScoredModel } from './scoring'

export interface PipelineStageInput {
  taskType: string
  inputLength: string
  requiresCapabilities: string[]
  priorityOrder: Factor[]
  needsReasoning?: boolean
  dataSensitivity?: string
  latencyTarget?: string
  volume?: string
}

export interface PipelineStageResult {
  recommended: ScoredModel
  alternative: ScoredModel | null
}

export interface PipelineResult {
  stages: Array<{
    stage: number
    description: string
    taskType: string
    recommended: ScoredModel
    alternative: ScoredModel | null
  }>
  totalEstimatedCost: number
}

export function scorePipelineStage(input: PipelineStageInput): PipelineStageResult {
  const scored = scoreModels({
    taskType: input.taskType,
    complexity: 'moderate',
    inputLength: input.inputLength,
    needsVision: input.requiresCapabilities.includes('vision'),
    needsTools: input.requiresCapabilities.includes('tools'),
    needsCode: input.requiresCapabilities.includes('code'),
    priorityOrder: input.priorityOrder,
    needsReasoning: input.needsReasoning ?? false,
    dataSensitivity: input.dataSensitivity,
    latencyTarget: input.latencyTarget,
    volume: input.volume,
  })

  // Further filter by additional required capabilities
  const filtered = input.requiresCapabilities.length > 0
    ? scored.filter(m => input.requiresCapabilities.every(cap => m.capabilities.includes(cap)))
    : scored

  const models = filtered.length > 0 ? filtered : scored

  return {
    recommended: models[0],
    alternative: models.length > 1 ? models[1] : null,
  }
}

export function scorePipeline(
  stages: Array<{ stage: number; task_type: string; description: string; requires_capabilities: string[] }>,
  inputLength: string,
  priorityOrder: Factor[],
  needsReasoning: boolean = false,
  dataSensitivity?: string,
  latencyTarget?: string,
  volume?: string,
): PipelineResult {
  const results = stages.map(stage => {
    const stageResult = scorePipelineStage({
      taskType: stage.task_type,
      inputLength,
      requiresCapabilities: stage.requires_capabilities,
      priorityOrder,
      needsReasoning,
      dataSensitivity,
      latencyTarget,
      volume,
    })
    return {
      stage: stage.stage,
      description: stage.description,
      taskType: stage.task_type,
      ...stageResult,
    }
  })

  const totalEstimatedCost = results.reduce(
    (sum, s) => sum + s.recommended.estimatedCost, 0
  )

  return { stages: results, totalEstimatedCost }
}
