import { getValidationResults } from '@/app/actions'
import type { ScoredModel } from '@/lib/scoring'
import type { Factor } from '@/lib/registry'

const FACTOR_LABELS: Record<Factor, string> = {
  cost: 'Cost',
  speed: 'Speed',
  quality: 'Quality',
  privacy: 'Privacy',
  sustainability: 'Sustainability',
  transparency: 'Transparency',
  capability: 'Capability',
}

const FACTORS: Factor[] = [
  'quality',
  'capability',
  'cost',
  'speed',
  'privacy',
  'sustainability',
  'transparency',
]

function FactorBars({ model }: { model: ScoredModel }) {
  return (
    <div className="space-y-2">
      {FACTORS.map((factor) => {
        const score = model.factorScores[factor] ?? 0
        const pct = Math.round(score * 100)
        return (
          <div key={factor} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-grey-blue text-xs font-mono">
              {FACTOR_LABELS[factor]}
            </span>
            <div className="flex-1 h-2 rounded-full bg-cream-dark">
              <div
                className="h-2 rounded-full bg-teal"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-grey-blue text-xs font-mono">
              {pct}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ModelCard({
  model,
  rank,
  isHighlighted,
  highlightLabel,
}: {
  model: ScoredModel
  rank: number
  isHighlighted?: boolean
  highlightLabel?: string
}) {
  const matchPercent = Math.round(model.weightedScore * 100)

  return (
    <div
      className={`rounded-xl border p-5 transition-colors shadow-sm ${
        isHighlighted
          ? 'border-teal border-2 bg-teal/5'
          : 'bg-white border-cream-dark'
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-lg font-bold ${
                isHighlighted
                  ? 'bg-teal text-white'
                  : 'bg-cream-dark text-navy'
              }`}
            >
              {rank}
            </span>
            <h3 className="font-display text-xl font-bold text-navy">
              {model.name}
            </h3>
            {highlightLabel && (
              <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal">
                {highlightLabel}
              </span>
            )}
          </div>
          <p className="mt-0.5 ml-9 text-grey-blue text-sm">
            {model.provider}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-3xl font-bold text-navy">
            {matchPercent}%
          </p>
          <p className="text-grey-blue text-xs">match</p>
        </div>
      </div>

      <div className="ml-9 mb-3">
        <FactorBars model={model} />
      </div>

      <div className="ml-9">
        <p className="font-mono text-sm text-grey-blue">
          ~${model.estimatedCost.toFixed(4)} per task
        </p>
      </div>
    </div>
  )
}

export default async function ValidateResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>
  searchParams: Promise<{ model?: string }>
}) {
  const { taskId } = await params
  const { model: modelSlug } = await searchParams

  if (!modelSlug) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-2 font-display text-navy">
            Missing model
          </h2>
          <p className="text-grey-blue">
            No model was specified. Please go back and select a model.
          </p>
        </div>
      </main>
    )
  }

  const result = await getValidationResults(taskId, modelSlug)

  if ('error' in result && result.error) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-2 font-display text-navy">
            Something went wrong
          </h2>
          <p className="text-grey-blue">{result.error}</p>
        </div>
      </main>
    )
  }

  const { task, models, currentModel, currentModelRank, assessment } =
    result as {
      task: { task_type: string }
      models: ScoredModel[]
      currentModel: ScoredModel | null
      currentModelRank: number | null
      assessment: 'good_fit' | 'overpaying' | 'better_options'
    }

  const topModel = models[0]

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-2 font-display text-navy">
          Validation results
        </h2>
        <p className="text-grey-blue mb-8">
          Assessed for <strong>{task.task_type}</strong> tasks
        </p>

        {/* Assessment banner */}
        {assessment === 'good_fit' && (
          <div className="mb-8 rounded-xl border-2 border-teal bg-teal/5 p-6">
            <h3 className="font-display text-xl font-bold text-teal mb-2">
              Good fit — this is a strong choice for what you&apos;re doing
            </h3>
            {currentModel && currentModelRank && (
              <div className="flex items-center gap-6">
                <p className="text-navy text-sm">
                  <strong>{currentModel.name}</strong> ranks{' '}
                  <span className="font-mono font-bold text-teal">
                    #{currentModelRank}
                  </span>{' '}
                  of {models.length} models
                </p>
                <p className="font-mono text-sm text-navy">
                  Score:{' '}
                  <span className="font-bold">
                    {Math.round(currentModel.weightedScore * 100)}%
                  </span>
                </p>
              </div>
            )}
            {currentModel && (
              <div className="mt-4">
                <FactorBars model={currentModel} />
              </div>
            )}
          </div>
        )}

        {assessment === 'overpaying' && (
          <div className="mb-8 rounded-xl border-2 border-amber bg-amber/5 p-6">
            <h3 className="font-display text-xl font-bold text-amber mb-2">
              You could get similar results for less
            </h3>
            {currentModel && currentModelRank && (
              <div className="flex items-center gap-6 mb-4">
                <p className="text-navy text-sm">
                  <strong>{currentModel.name}</strong> ranks{' '}
                  <span className="font-mono font-bold text-amber">
                    #{currentModelRank}
                  </span>{' '}
                  of {models.length} models
                </p>
                <p className="font-mono text-sm text-navy">
                  Cost: ~${currentModel.estimatedCost.toFixed(4)}/task
                </p>
              </div>
            )}
            {topModel && topModel.slug !== currentModel?.slug && (
              <div className="rounded-lg border border-amber/30 bg-white p-4">
                <p className="text-sm text-grey-blue mb-2">
                  Top-ranked cheaper alternative:
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display font-bold text-navy">
                      {topModel.name}
                    </p>
                    <p className="text-xs text-grey-blue">{topModel.provider}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold text-navy">
                      {Math.round(topModel.weightedScore * 100)}%
                    </p>
                    <p className="font-mono text-xs text-grey-blue">
                      ~${topModel.estimatedCost.toFixed(4)}/task
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {assessment === 'better_options' && (
          <div className="mb-8 rounded-xl border-2 border-coral bg-coral/5 p-6">
            <h3 className="font-display text-xl font-bold text-coral mb-2">
              Better options exist for this task
            </h3>
            {currentModel && currentModelRank ? (
              <p className="text-navy text-sm mb-4">
                <strong>{currentModel.name}</strong> ranks{' '}
                <span className="font-mono font-bold text-coral">
                  #{currentModelRank}
                </span>{' '}
                of {models.length} models for this task type.
              </p>
            ) : (
              <p className="text-navy text-sm mb-4">
                The selected model was not found in our registry or does not meet
                the capability requirements for this task.
              </p>
            )}
            <p className="text-sm text-grey-blue mb-3">Top 3 for this task:</p>
            <div className="space-y-2">
              {models.slice(0, 3).map((m, i) => (
                <div
                  key={m.slug}
                  className="flex items-center justify-between rounded-lg border border-coral/20 bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-coral text-white font-mono text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="font-display font-semibold text-navy">
                      {m.name}
                    </span>
                    <span className="text-xs text-grey-blue">{m.provider}</span>
                  </div>
                  <span className="font-mono text-sm font-bold text-navy">
                    {Math.round(m.weightedScore * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full ranked list */}
        <h3 className="font-display text-lg font-bold text-navy mb-4">
          Full ranking
        </h3>
        <div className="space-y-4">
          {models.map((model, index) => {
            const rank = index + 1
            const isCurrent = model.slug === modelSlug

            return (
              <ModelCard
                key={model.slug}
                model={model}
                rank={rank}
                isHighlighted={isCurrent}
                highlightLabel={isCurrent ? 'Your model' : undefined}
              />
            )
          })}
        </div>
      </div>
    </main>
  )
}
