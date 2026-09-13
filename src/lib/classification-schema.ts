import { ALL_TASK_TYPES, type TaskType } from './registry'

export const COMPLEXITIES = ['simple', 'moderate', 'complex'] as const
export const LENGTHS = ['short', 'medium', 'long', 'very_long'] as const
export const DATA_SENSITIVITIES = ['none', 'pii', 'regulated_health', 'regulated_finance', 'on_prem_required'] as const
export const LATENCY_TARGETS = ['realtime', 'interactive', 'batch'] as const
export const VOLUMES = ['one_off', 'hundreds_per_day', 'thousands_per_day', 'millions_per_day'] as const
export const CLASSIFIER_CAPABILITIES = [
  'vision', 'tools', 'code', 'long_context', 'extended_thinking',
  'structured_output', 'multilingual', 'audio', 'video', 'computer_use',
] as const

export type Complexity = typeof COMPLEXITIES[number]
export type Length = typeof LENGTHS[number]
export type DataSensitivity = typeof DATA_SENSITIVITIES[number]
export type LatencyTarget = typeof LATENCY_TARGETS[number]
export type Volume = typeof VOLUMES[number]
export type ClassifierCapability = typeof CLASSIFIER_CAPABILITIES[number]

export interface PipelineStageClassification {
  stage: number
  task_type: TaskType
  description: string
  requires_capabilities: ClassifierCapability[]
  input_length?: Length
  output_length?: Length
  needs_reasoning?: boolean
}

export interface Classification {
  task_type: TaskType
  task_subtype: string | null
  complexity: Complexity
  input_length: Length
  needs_vision: boolean
  needs_tools: boolean
  needs_code: boolean
  needs_reasoning: boolean
  is_recurring: boolean
  data_sensitivity: DataSensitivity
  latency_target: LatencyTarget
  volume: Volume
  needs_long_context: boolean
  needs_multilingual: boolean
  is_agentic: boolean
  output_length: Length
  confidence: number
  clarification_needed: boolean
  suggested_questions: { question: string; options: string[] }[]
  pipeline_recommended: boolean
  pipeline_stages: PipelineStageClassification[] | null
}

export interface ClarificationAnswer {
  question: string
  answer: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`)
  return value
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`)
  return value
}

function requireNullableString(value: unknown, path: string): string | null {
  if (value === null) return null
  return requireString(value, path)
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`)
  return value
}

function requireEnum<T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${path} must be one of: ${allowed.join(', ')}`)
  }
  return value as T[number]
}

function requireConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('classification.confidence must be a finite number between 0 and 1')
  }
  return value
}

function validateSuggestedQuestions(value: unknown): Classification['suggested_questions'] {
  if (!Array.isArray(value)) throw new Error('classification.suggested_questions must be an array')
  return value.map((item, index) => {
    const row = requireRecord(item, `classification.suggested_questions[${index}]`)
    if (!Array.isArray(row.options) || row.options.some((option) => typeof option !== 'string')) {
      throw new Error(`classification.suggested_questions[${index}].options must be an array of strings`)
    }
    return {
      question: requireString(row.question, `classification.suggested_questions[${index}].question`),
      options: row.options as string[],
    }
  })
}

function validatePipelineStages(value: unknown): Classification['pipeline_stages'] {
  if (value === null) return null
  if (!Array.isArray(value)) throw new Error('classification.pipeline_stages must be an array or null')

  return value.map((item, index) => {
    const row = requireRecord(item, `classification.pipeline_stages[${index}]`)
    if (typeof row.stage !== 'number' || !Number.isInteger(row.stage) || row.stage < 1) {
      throw new Error(`classification.pipeline_stages[${index}].stage must be a positive integer`)
    }
    if (!Array.isArray(row.requires_capabilities)) {
      throw new Error(`classification.pipeline_stages[${index}].requires_capabilities must be an array`)
    }
    const requiresCapabilities = row.requires_capabilities.map((capability, capabilityIndex) =>
      requireEnum(
        capability,
        CLASSIFIER_CAPABILITIES,
        `classification.pipeline_stages[${index}].requires_capabilities[${capabilityIndex}]`,
      ),
    )

    return {
      stage: row.stage,
      task_type: requireEnum(row.task_type, ALL_TASK_TYPES, `classification.pipeline_stages[${index}].task_type`),
      description: requireString(row.description, `classification.pipeline_stages[${index}].description`),
      requires_capabilities: requiresCapabilities,
      ...(row.input_length === undefined
        ? {}
        : { input_length: requireEnum(row.input_length, LENGTHS, `classification.pipeline_stages[${index}].input_length`) }),
      ...(row.output_length === undefined
        ? {}
        : { output_length: requireEnum(row.output_length, LENGTHS, `classification.pipeline_stages[${index}].output_length`) }),
      ...(row.needs_reasoning === undefined
        ? {}
        : { needs_reasoning: requireBoolean(row.needs_reasoning, `classification.pipeline_stages[${index}].needs_reasoning`) }),
    }
  })
}

/**
 * Validate untrusted classifier output at runtime and return a normalized object.
 * Unknown keys are deliberately dropped. This is the boundary between model
 * output and persisted/scored task data; TypeScript casts are not accepted here.
 */
export function validateClassification(value: unknown): Classification {
  const row = requireRecord(value, 'classification')
  const pipelineRecommended = requireBoolean(row.pipeline_recommended, 'classification.pipeline_recommended')
  const pipelineStages = validatePipelineStages(row.pipeline_stages)

  if (pipelineRecommended && (!pipelineStages || pipelineStages.length === 0)) {
    throw new Error('classification.pipeline_stages must contain at least one stage when pipeline_recommended is true')
  }

  return {
    task_type: requireEnum(row.task_type, ALL_TASK_TYPES, 'classification.task_type'),
    task_subtype: requireNullableString(row.task_subtype, 'classification.task_subtype'),
    complexity: requireEnum(row.complexity, COMPLEXITIES, 'classification.complexity'),
    input_length: requireEnum(row.input_length, LENGTHS, 'classification.input_length'),
    needs_vision: requireBoolean(row.needs_vision, 'classification.needs_vision'),
    needs_tools: requireBoolean(row.needs_tools, 'classification.needs_tools'),
    needs_code: requireBoolean(row.needs_code, 'classification.needs_code'),
    needs_reasoning: requireBoolean(row.needs_reasoning, 'classification.needs_reasoning'),
    is_recurring: requireBoolean(row.is_recurring, 'classification.is_recurring'),
    data_sensitivity: requireEnum(row.data_sensitivity, DATA_SENSITIVITIES, 'classification.data_sensitivity'),
    latency_target: requireEnum(row.latency_target, LATENCY_TARGETS, 'classification.latency_target'),
    volume: requireEnum(row.volume, VOLUMES, 'classification.volume'),
    needs_long_context: requireBoolean(row.needs_long_context, 'classification.needs_long_context'),
    needs_multilingual: requireBoolean(row.needs_multilingual, 'classification.needs_multilingual'),
    is_agentic: requireBoolean(row.is_agentic, 'classification.is_agentic'),
    output_length: requireEnum(row.output_length, LENGTHS, 'classification.output_length'),
    confidence: requireConfidence(row.confidence),
    clarification_needed: requireBoolean(row.clarification_needed, 'classification.clarification_needed'),
    suggested_questions: validateSuggestedQuestions(row.suggested_questions),
    pipeline_recommended: pipelineRecommended,
    pipeline_stages: pipelineStages,
  }
}

// The Anthropic tool schema is built from the same canonical constants used by
// runtime validation. Adding a task type/capability in one place therefore
// updates both the generation constraint and the acceptance boundary.
export const CLASSIFY_TOOL = {
  name: 'classify_task',
  description: 'Return the structured classification of the user task.',
  input_schema: {
    type: 'object' as const,
    properties: {
      task_type: { type: 'string', enum: [...ALL_TASK_TYPES] },
      task_subtype: { type: ['string', 'null'] },
      complexity: { type: 'string', enum: [...COMPLEXITIES] },
      input_length: { type: 'string', enum: [...LENGTHS] },
      needs_vision: { type: 'boolean' },
      needs_tools: { type: 'boolean' },
      needs_code: { type: 'boolean' },
      needs_reasoning: { type: 'boolean' },
      is_recurring: { type: 'boolean' },
      data_sensitivity: { type: 'string', enum: [...DATA_SENSITIVITIES] },
      latency_target: { type: 'string', enum: [...LATENCY_TARGETS] },
      volume: { type: 'string', enum: [...VOLUMES] },
      needs_long_context: { type: 'boolean' },
      needs_multilingual: { type: 'boolean' },
      is_agentic: { type: 'boolean' },
      output_length: { type: 'string', enum: [...LENGTHS] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      clarification_needed: { type: 'boolean' },
      suggested_questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
          },
          required: ['question', 'options'],
        },
      },
      pipeline_recommended: { type: 'boolean' },
      pipeline_stages: {
        type: ['array', 'null'],
        items: {
          type: 'object',
          properties: {
            stage: { type: 'number' },
            task_type: { type: 'string', enum: [...ALL_TASK_TYPES] },
            description: { type: 'string' },
            requires_capabilities: {
              type: 'array',
              items: { type: 'string', enum: [...CLASSIFIER_CAPABILITIES] },
            },
            input_length: { type: 'string', enum: [...LENGTHS] },
            output_length: { type: 'string', enum: [...LENGTHS] },
            needs_reasoning: { type: 'boolean' },
          },
          required: ['stage', 'task_type', 'description', 'requires_capabilities'],
        },
      },
    },
    required: [
      'task_type', 'task_subtype', 'complexity', 'input_length',
      'needs_vision', 'needs_tools', 'needs_code', 'needs_reasoning', 'is_recurring',
      'data_sensitivity', 'latency_target', 'volume', 'needs_long_context',
      'needs_multilingual', 'is_agentic', 'output_length', 'confidence',
      'clarification_needed', 'suggested_questions', 'pipeline_recommended', 'pipeline_stages',
    ],
  },
}
