import { type Factor } from './registry'
import { scoreModels, type ScoredModel } from './scoring'

// Canonical capability tokens. Anything outside this set is dropped before
// filtering — the classifier sometimes emits free-form descriptors (e.g.
// "ocr", "extraction") that no registry model advertises, which would
// otherwise trigger a spurious capabilityMissing warning on every stage.
const KNOWN_CAPABILITIES = new Set([
  'vision', 'tools', 'code', 'long_context', 'extended_thinking',
  'structured_output', 'multilingual', 'audio', 'video', 'computer_use',
])

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
  capabilityMissing?: boolean
}

export interface PipelineResult {
  stages: Array<{
    stage: number
    description: string
    taskType: string
    recommended: ScoredModel
    alternative: ScoredModel | null
    capabilityMissing?: boolean
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

  // Further filter by additional required capabilities. Drop unknown tokens
  // (see KNOWN_CAPABILITIES note above) so the classifier emitting "ocr" or
  // similar doesn't cause every stage to flag capabilityMissing.
  const knownCaps = input.requiresCapabilities.filter(cap => KNOWN_CAPABILITIES.has(cap))
  const filtered = knownCaps.length > 0
    ? scored.filter(m => knownCaps.every(cap => m.capabilities.includes(cap)))
    : scored

  const capabilityMissing = knownCaps.length > 0 && filtered.length === 0
  const models = filtered.length > 0 ? filtered : scored

  return {
    recommended: models[0],
    alternative: models.length > 1 ? models[1] : null,
    capabilityMissing,
  }
}

// Phase 4 batch B: refactored from positional args (was up to 7) to an options
// object. Adding more positional args (long-context, multilingual, agentic,
// output_length) would have crossed into foot-gun territory at 11 args; the
// options object scales cleanly and lets callers omit unused fields.
export interface ScorePipelineOptions {
  stages: Array<{
    stage: number
    task_type: string
    description: string
    requires_capabilities: string[]
    input_length?: string
    output_length?: string
    needs_reasoning?: boolean
  }>
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
      inputLength: stage.input_length ?? inputLength,
      outputLength: stage.output_length ?? options.outputLength,
      requiresCapabilities: stage.requires_capabilities,
      priorityOrder,
      needsReasoning: stage.needs_reasoning ?? options.needsReasoning ?? false,
      dataSensitivity: options.dataSensitivity,
      latencyTarget: options.latencyTarget,
      volume: options.volume,
      needsLongContext: options.needsLongContext,
      needsMultilingual: options.needsMultilingual,
      isAgentic: options.isAgentic,
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
