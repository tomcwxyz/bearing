import { getTask } from '@/lib/db'
import { getLatestBenchmarkScores } from '@/lib/benchmarks'
import { scoreModelsDetailed } from '@/lib/scoring'
import type { Factor } from '@/lib/registry'

const DEFAULT_EMBEDDING_PRIORITIES: Factor[] = [
  'quality',
  'cost',
  'speed',
  'capability',
  'privacy',
  'sustainability',
  'transparency',
]

function parsePriorityOrder(value: unknown): Factor[] {
  if (!value) return DEFAULT_EMBEDDING_PRIORITIES
  if (Array.isArray(value)) return value as Factor[]
  if (typeof value !== 'string') return DEFAULT_EMBEDDING_PRIORITIES

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as Factor[] : DEFAULT_EMBEDDING_PRIORITIES
  } catch {
    return DEFAULT_EMBEDDING_PRIORITIES
  }
}

/** Load and re-score a persisted embedding task for its dedicated results UI. */
export async function getEmbeddingResults(taskId: string) {
  try {
    const task = await getTask(taskId)
    if (!task) return { error: 'Task not found.' }
    if (task.task_type !== 'embedding') {
      return { error: 'This task is not an embedding task.' }
    }

    const priorityOrder = parsePriorityOrder(task.priority_order)
    const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
    const { models } = scoreModelsDetailed({
      taskType: 'embedding',
      complexity: task.complexity ?? 'simple',
      inputLength: task.input_length ?? 'medium',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      needsReasoning: false,
      dataSensitivity: task.data_sensitivity ?? 'none',
      latencyTarget: task.latency_target ?? 'batch',
      volume: 'one_off',
      needsLongContext: false,
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
