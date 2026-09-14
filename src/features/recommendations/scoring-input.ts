import type { BenchmarkScoreMap } from '@/lib/benchmark-evidence'
import type { Factor } from '@/lib/registry'
import type { ScoringInput } from '@/lib/scoring'

export interface TaskScoringSource {
  task_type: string
  complexity: string
  input_length: string
  needs_vision: boolean
  needs_tools: boolean
  needs_code: boolean
  needs_reasoning?: boolean | null
  data_sensitivity?: string | null
  latency_target?: string | null
  volume?: string | null
  needs_long_context?: boolean | null
  needs_multilingual?: boolean | null
  is_agentic?: boolean | null
  output_length?: string | null
  priority_order?: unknown
  excluded_factors?: unknown
}

const DEFAULT_PRIORITY_ORDER: Factor[] = [
  'quality',
  'cost',
  'speed',
  'capability',
  'privacy',
  'sustainability',
  'transparency',
]

function parseArray<T>(value: unknown, fallback: T[]): T[] {
  if (!value) return fallback
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return fallback

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : fallback
  } catch {
    return fallback
  }
}

/** Map a persisted task row into the single scoring contract used by recommendations. */
export function scoringInputFromTask(
  task: TaskScoringSource,
  benchmarkScores?: BenchmarkScoreMap,
): ScoringInput {
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
    priorityOrder: parseArray<Factor>(task.priority_order, DEFAULT_PRIORITY_ORDER),
    excludedFactors: parseArray<string>(task.excluded_factors, []),
    benchmarkScores,
  }
}
