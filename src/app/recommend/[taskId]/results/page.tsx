import Link from 'next/link'
import { getResults } from '@/app/actions'
import { ResultsClient } from './results-client'
import { StepProgress } from '@/components/step-progress'
import { TASK_TYPE_LABELS, type Factor } from '@/lib/registry'
import { describeBearing, deriveBearingPriorities } from '@/lib/bearing-policy'
import type { ScoredModel, Exclusion, HardFilterReason } from '@/lib/scoring'
import type { PipelineResult } from '@/lib/pipeline'
import type { LocalInferenceResult } from '@/lib/local-inference'
import { getModelVerificationSummaries } from '@/db/model-verification'
import {
  recommendationEvidence,
  type RecommendationEvidence,
} from '@/lib/recommendation-evidence'
import { recommendationConfidence } from '@/lib/recommendation-confidence'

function parsePriorityOrder(value: unknown): Factor[] {
  if (!value) return []
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(parsed) ? parsed as Factor[] : []
  } catch {
    return []
  }
}

export default async function ResultsPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const result = await getResults(taskId)

  if ('error' in result && result.error) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-2 font-display text-navy">Something went wrong</h2>
          <p className="text-grey-blue">{result.error}</p>
        </div>
      </main>
    )
  }

  const { task, models, reasoning, pipeline, local, excluded } = result as unknown as {
    task: {
      task_type: string
      priority_order?: unknown
      complexity?: string | null
      classification_confidence?: number | null
      needs_reasoning?: boolean | null
      needs_vision?: boolean | null
      needs_tools?: boolean | null
      needs_code?: boolean | null
      data_sensitivity?: string | null
      latency_target?: string | null
      volume?: string | null
      needs_long_context?: boolean | null
      needs_multilingual?: boolean | null
      is_agentic?: boolean | null
    }
    models: ScoredModel[]
    reasoning: Record<string, string>
    pipeline: (PipelineResult & { reasoning: string }) | null
    local: LocalInferenceResult | null
    excluded?: Exclusion[]
  }

  const persistedPriorityOrder = parsePriorityOrder(task.priority_order)
  const priorityOrder = persistedPriorityOrder.length > 0
    ? persistedPriorityOrder
    : deriveBearingPriorities(task)

  let evidenceBySlug: Record<string, RecommendationEvidence> = {}
  try {
    const verification = await getModelVerificationSummaries()
    const freshnessBySlug = new Map(verification.map((item) => [item.slug, item]))
    evidenceBySlug = Object.fromEntries(
      models.map((model) => [
        model.slug,
        recommendationEvidence(freshnessBySlug.get(model.slug)),
      ]),
    )
  } catch (error) {
    console.warn('[results] model verification evidence unavailable', error)
    evidenceBySlug = Object.fromEntries(
      models.map((model) => [model.slug, recommendationEvidence(null)]),
    )
  }

  const decisionConfidence = recommendationConfidence({
    classificationConfidence: task.classification_confidence,
    topScore: models[0]?.weightedScore,
    secondScore: models[1]?.weightedScore,
    evidence: models[0] ? evidenceBySlug[models[0].slug] : null,
  })

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <StepProgress current="results" hideClarify hidePrioritize />

        <h2 className="text-2xl font-bold mb-2 font-display text-navy">Your bearing</h2>
        <p className="text-grey-blue">
          Ranked for <strong>{(TASK_TYPE_LABELS as Record<string, string>)[task.task_type] ?? task.task_type}</strong> tasks.
        </p>
        <div className="mb-8 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-teal/20 bg-teal/5 px-4 py-3">
          <p className="flex-1 text-sm text-navy/75">{describeBearing(priorityOrder)}</p>
          <Link
            href={`/recommend/${taskId}/priorities?adjust=1`}
            className="text-sm font-medium text-teal underline-offset-2 hover:underline"
          >
            Adjust bearing
          </Link>
        </div>
        {excluded && excluded.length > 0 && <ExclusionSummary excluded={excluded} />}
        <ResultsClient
          taskId={taskId}
          models={models}
          reasoning={reasoning}
          pipeline={pipeline}
          local={local}
          evidenceBySlug={evidenceBySlug}
          decisionConfidence={decisionConfidence}
        />
      </div>
    </main>
  )
}

const REASON_LABELS: Record<HardFilterReason, string> = {
  long_context: 'their context window is too small',
  on_prem_required: 'they cannot run on-prem',
  realtime: 'they are too slow for realtime use',
  missing_vision: 'they do not support vision',
  missing_tools: 'they do not support tool use',
  missing_code: 'they are not coding-capable',
  wrong_class: 'they are the wrong model class (embedding vs chat) for this task',
}

function ExclusionSummary({ excluded }: { excluded: Exclusion[] }) {
  const grouped = excluded.reduce<Record<HardFilterReason, number>>((acc, e) => {
    acc[e.reason] = (acc[e.reason] ?? 0) + 1
    return acc
  }, {} as Record<HardFilterReason, number>)
  const parts = Object.entries(grouped).map(
    ([reason, count]) => `${count} excluded because ${REASON_LABELS[reason as HardFilterReason]}`
  )
  return (
    <p className="text-sm text-grey-blue mb-6 italic">
      {parts.join(' · ')}
    </p>
  )
}
