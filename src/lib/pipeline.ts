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
  needsLongContext?: boolean
  needsMultilingual?: boolean
  isAgentic?: boolean
  outputLength?: string
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
    needsLongContext: input.needsLongContext,
    needsMultilingual: input.needsMultilingual,
    isAgentic: input.isAgentic,
    outputLength: input.outputLength,
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

// Phase 4 batch B: refactored from positional args (was up to 7) to an options
// object. Adding more positional args (long-context, multilingual, agentic,
// output_length) would have crossed into foot-gun territory at 11 args; the
// options object scales cleanly and lets callers omit unused fields.
export interface ScorePipelineOptions {
  stages: Array<{ stage: number; task_type: string; description: string; requires_capabilities: string[] }>
  inputLength: string
  priorityOrder: Factor[]
  needsReasoning?: boolean
  dataSensitivity?: string
  latencyTarget?: string
  volume?: string
  needsLongContext?: boolean
  needsMultilingual?: boolean
  isAgentic?: boolean
  outputLength?: string
}

export function scorePipeline(options: ScorePipelineOptions): PipelineResult {
  const { stages, inputLength, priorityOrder } = options
  const results = stages.map(stage => {
    const stageResult = scorePipelineStage({
      taskType: stage.task_type,
      inputLength,
      requiresCapabilities: stage.requires_capabilities,
      priorityOrder,
      needsReasoning: options.needsReasoning ?? false,
      dataSensitivity: options.dataSensitivity,
      latencyTarget: options.latencyTarget,
      volume: options.volume,
      needsLongContext: options.needsLongContext,
      needsMultilingual: options.needsMultilingual,
      isAgentic: options.isAgentic,
      outputLength: options.outputLength,
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
