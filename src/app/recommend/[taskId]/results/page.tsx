import { getResults } from '@/app/actions'
import { ResultsClient } from './results-client'
import { StepProgress } from '@/components/step-progress'
import { TASK_TYPE_LABELS } from '@/lib/registry'
import type { ScoredModel, Exclusion, HardFilterReason } from '@/lib/scoring'
import type { PipelineResult } from '@/lib/pipeline'
import type { LocalInferenceResult } from '@/lib/local-inference'

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
    task: { task_type: string }
    models: ScoredModel[]
    reasoning: Record<string, string>
    pipeline: (PipelineResult & { reasoning: string }) | null
    local: LocalInferenceResult | null
    excluded?: Exclusion[]
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <StepProgress current="results" hideClarify />

        <h2 className="text-2xl font-bold mb-2 font-display text-navy">Your results</h2>
        <p className="text-grey-blue mb-8">
          Ranked for <strong>{(TASK_TYPE_LABELS as Record<string, string>)[task.task_type] ?? task.task_type}</strong> tasks based on your priorities
        </p>
        {excluded && excluded.length > 0 && <ExclusionSummary excluded={excluded} />}
        <ResultsClient
          taskId={taskId}
          models={models}
          reasoning={reasoning}
          pipeline={pipeline}
          local={local}
        />
      </div>
    </main>
  )
}

// Phase 5.4: one-line summary of which models were dropped by hard filters
// and why. Reasons are grouped so the user sees "5 models excluded because
// they require cloud hosting" rather than a flat list.
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
