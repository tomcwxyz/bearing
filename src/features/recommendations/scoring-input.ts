import type { BenchmarkScoreMap } from '@/lib/benchmark-evidence'
import type { Factor } from '@/lib/registry'
import type { ScoringInput } from '@/lib/scoring'

/**
 * Minimal persisted-task shape needed by recommendation scoring.
 *
 * The legacy DB layer currently returns generic records, so fields are optional
 * here and normalised at this boundary. Real task rows contain these required
 * columns; the defaults make the service fail-safe for older/partial fixtures
 * without leaking `any` through the scoring engine.
 */
export interface TaskScoringSource {
  task_type?: string | null
  complexity?: string | null
  input_length?: string | null
  needs_vision?: boolean | null
  needs_tools?: boolean | null
  needs_code?: boolean | null
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
    taskType: task.task_type ?? 'other',
    complexity: task.complexity ?? 'moderate',
    inputLength: task.input_length ?? 'medium',
    needsVision: task.needs_vision ?? false,
    needsTools: task.needs_tools ?? false,
    needsCode: task.needs_code ?? false,
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
