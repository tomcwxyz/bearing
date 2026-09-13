import { deriveBearingPriorities } from '@/lib/bearing-policy'
import { getModel } from '@/lib/registry'
import { scoreModelsDetailed, type ScoredModel } from '@/lib/scoring'
import type { GoldenTask } from './golden-tasks'

export interface GoldenTaskEvaluation {
  id: string
  top: string | null
  top3: string[]
  eligibleCount: number
  excludedCount: number
  issues: string[]
  models: ScoredModel[]
}

function priorityOrder(task: GoldenTask) {
  const c = task.classification
  return deriveBearingPriorities({
    task_type: c.taskType,
    complexity: c.complexity,
    needs_reasoning: c.needsReasoning,
    needs_vision: c.needsVision,
    needs_tools: c.needsTools,
    needs_code: c.needsCode,
    data_sensitivity: c.dataSensitivity,
    latency_target: c.latencyTarget,
    volume: c.volume,
    needs_long_context: c.needsLongContext,
    needs_multilingual: c.needsMultilingual,
    is_agentic: c.isAgentic,
  })
}

/**
 * Score one golden task with production ranking logic and check invariants that
 * should hold regardless of which particular model is fashionable this month.
 */
export function evaluateGoldenTask(
  task: GoldenTask,
  benchmarkScores?: Map<string, number>,
): GoldenTaskEvaluation {
  const result = scoreModelsDetailed({
    ...task.classification,
    priorityOrder: priorityOrder(task),
    benchmarkScores,
  })

  const issues: string[] = []
  const expectedClass = task.classification.taskType === 'embedding' ? 'embedding' : 'chat'

  if (result.models.length === 0) {
    issues.push('no eligible models')
  }

  for (let i = 1; i < result.models.length; i++) {
    if (result.models[i - 1].weightedScore < result.models[i].weightedScore) {
      issues.push('ranking is not sorted descending')
      break
    }
  }

  for (const scored of result.models) {
    const model = getModel(scored.slug)
    if (!model) {
      issues.push(`${scored.slug}: missing registry row`)
      continue
    }

    if (model.model_class !== expectedClass) {
      issues.push(`${scored.slug}: expected model class ${expectedClass}, got ${model.model_class}`)
    }
    if (task.classification.needsVision && !model.capabilities.includes('vision')) {
      issues.push(`${scored.slug}: missing required vision capability`)
    }
    if (task.classification.needsTools && !model.capabilities.includes('tools')) {
      issues.push(`${scored.slug}: missing required tools capability`)
    }
    if (task.classification.needsCode && !model.capabilities.includes('code')) {
      issues.push(`${scored.slug}: missing required code capability`)
    }
    if (task.classification.needsLongContext && expectedClass === 'chat' && model.context_window < 100_000) {
      issues.push(`${scored.slug}: below long-context threshold`)
    }
    if (task.classification.dataSensitivity === 'on_prem_required' && !model.local_info) {
      issues.push(`${scored.slug}: hosted-only model survived on-prem hard gate`)
    }
    if (task.classification.latencyTarget === 'realtime' && model.speed_score < 0.85) {
      issues.push(`${scored.slug}: slow model survived realtime hard gate`)
    }
  }

  return {
    id: task.id,
    top: result.models[0]?.slug ?? null,
    top3: result.models.slice(0, 3).map((model) => model.slug),
    eligibleCount: result.models.length,
    excludedCount: result.excluded.length,
    issues,
    models: result.models,
  }
}

export function evaluateGoldenCorpus(
  tasks: GoldenTask[],
  benchmarkScores?: Map<string, number>,
): GoldenTaskEvaluation[] {
  return tasks.map((task) => evaluateGoldenTask(task, benchmarkScores))
}
