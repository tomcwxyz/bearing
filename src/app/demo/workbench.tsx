'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { recalculateContributorDemo } from './actions'
import type {
  DemoRequest, DemoResult, DemoScenario, DemoFocus,
} from '@/lib/contributor-fixtures'
import type { Factor } from '@/lib/registry'
import type { ScoredModel } from '@/lib/scoring'

const FACTORS: Factor[] = [
  'quality', 'capability', 'cost', 'speed', 'privacy', 'sustainability', 'transparency',
]
const FACTOR_LABELS: Record<Factor, string> = {
  quality: 'Quality', capability: 'Capability', cost: 'Cost', speed: 'Speed',
  privacy: 'Privacy', sustainability: 'Sustainability', transparency: 'Transparency',
}
const EXCLUSION_LABELS: Record<string, string> = {
  wrong_class: 'Different model class',
  on_prem_required: 'No local route',
  missing_vision: 'Missing vision capability',
  missing_tools: 'Missing tool support',
  missing_code: 'Missing coding capability',
  long_context: 'Insufficient context window',
  realtime: 'Too slow for real-time use',
}

function currency(value: number): string {
  if (value === 0) return '$0'
  return value < 0.001 ? '$' + value.toPrecision(2) : '$' + value.toFixed(4)
}

function FactorBars({ values, isWeight = false }: {
  values: Record<Factor, number>
  isWeight?: boolean
}) {
  return (
    <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
      {FACTORS.map(factor => {
        const value = values[factor] ?? 0
        return (
          <div key={factor}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-navy/75">{FACTOR_LABELS[factor]}</span>
              <span className="font-mono text-navy/80">
                {isWeight ? (value * 100).toFixed(1) + '%' : value.toFixed(2)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-cream-dark">
              <div
                className="h-full rounded-full bg-teal transition-all"
                style={{ width: Math.max(0, Math.min(100, value * 100)) + '%' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ModelCard({ model, rank, reason, featured }: {
  model: ScoredModel
  rank: number
  reason?: string
  featured?: string
}) {
  return (
    <article className="rounded-xl border border-cream-dark bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-teal">
            {featured ?? (rank === 1 ? 'Best fit' : 'Rank ' + rank)}
          </span>
          <h3 className="mt-1 font-display text-lg font-semibold text-navy">
            <Link className="underline-offset-4 hover:underline" href={'/models/' + model.slug}>
              {model.name}
            </Link>
          </h3>
          <p className="text-sm text-grey-blue">{model.provider} · {model.tier.replaceAll('_', ' ')}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-navy">{model.weightedScore.toFixed(3)}</p>
          <p className="text-xs text-grey-blue">ranking score</p>
        </div>
      </div>
      {reason && <p className="mt-3 text-sm text-navy/80">{reason}</p>}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-grey-blue">
        <span>Estimated task cost: <strong className="text-navy">{currency(model.estimatedCost)}</strong></span>
        <span>Context: <strong className="text-navy">{model.contextWindow.toLocaleString('en-GB')}</strong></span>
        {model.localCapable && <span className="font-medium text-teal">Local evidence</span>}
      </div>
      <details className="mt-4 border-t border-cream-dark pt-3">
        <summary className="cursor-pointer text-sm font-medium text-teal">
          Inspect factor scores
        </summary>
        <div className="mt-4">
          <FactorBars values={model.factorScores} />
          <p className="mt-3 text-xs text-grey-blue">
            Factor scores may exceed 1 for contextual multipliers. They are not probabilities.
            The visual bars are capped at full width.
          </p>
        </div>
      </details>
    </article>
  )
}

function ScenarioControls({
  selection, update, busy, scenarios, focuses,
}: {
  selection: DemoRequest
  update: (change: Partial<DemoRequest>) => void
  busy: boolean
  scenarios: DemoScenario[]
  focuses: Record<DemoFocus, { label: string; note: string }>
}) {
  return (
    <section className="rounded-xl border border-cream-dark bg-white p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-navy" htmlFor="demo-task">Example task</label>
          <select
            id="demo-task"
            value={selection.scenarioId}
            disabled={busy}
            onChange={e => update({ scenarioId: e.target.value as DemoRequest['scenarioId'] })}
            className="w-full rounded-lg border border-cream-dark bg-white px-3 py-2.5 text-sm text-navy"
          >
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-navy" htmlFor="demo-focus">What matters most?</label>
          <select
            id="demo-focus"
            value={selection.focus}
            disabled={busy}
            onChange={e => update({ focus: e.target.value as DemoFocus })}
            className="w-full rounded-lg border border-cream-dark bg-white px-3 py-2.5 text-sm text-navy"
          >
            {(Object.keys(focuses) as DemoFocus[]).map(key => (
              <option key={key} value={key}>{focuses[key].label}</option>
            ))}
          </select>
        </div>
      </div>
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg bg-cream/70 px-4 py-3 text-sm text-navy">
        <input
          type="checkbox"
          className="mt-1 accent-teal"
          checked={selection.onPremOnly}
          disabled={busy}
          onChange={e => update({ onPremOnly: e.target.checked })}
        />
        <span>
          <strong>Must run on-premise</strong>
          <span className="mt-1 block text-grey-blue">
            Apply Bearing&apos;s hard local-execution requirement instead of only preferring privacy.
          </span>
        </span>
      </label>
    </section>
  )
}

export function DemoWorkbench({ scenarios, focuses, initial }: {
  scenarios: DemoScenario[]
  focuses: Record<DemoFocus, { label: string; note: string; priorities: Factor[] }>
  initial: DemoResult
}) {
  const [selection, setSelection] = useState<DemoRequest>(initial.request)
  const [result, setResult] = useState<DemoResult>(initial)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const newestRequest = useRef(0)

  function update(change: Partial<DemoRequest>) {
    const next = { ...selection, ...change }
    setSelection(next)
    setError(null)
    const id = ++newestRequest.current
    startTransition(async () => {
      try {
        const updated = await recalculateContributorDemo(next)
        if (id === newestRequest.current) setResult(updated)
      } catch {
        if (id === newestRequest.current) {
          setError('Could not calculate this example. Try another combination.')
        }
      }
    })
  }

  const best = result.models[0]
  const alternatives = result.alternatives
    .map(item => ({ item, model: result.models.find(m => m.slug === item.slug) }))
    .filter(row => row.model !== undefined)

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <div className="mb-8">
        <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-teal">Contributor workbench · local only</p>
        <h1 className="font-display text-4xl font-bold text-navy">Explore how Bearing decides</h1>
        <p className="mt-3 max-w-3xl text-grey-blue">
          Choose a synthetic example, change the priorities and inspect actual ranking decisions.
          This is Bearing&apos;s real deterministic scoring, using a checked-in catalogue,
          without Neon, AI provider credentials or saved results.
        </p>
      </div>
      <ScenarioControls
        selection={selection}
        update={update}
        busy={isPending}
        scenarios={scenarios}
        focuses={focuses}
      />
      {error && <p role="alert" className="mt-4 text-sm text-coral">{error}</p>}
      <div aria-live="polite" className="mt-6">
        {isPending && <p className="mb-3 text-sm font-medium text-teal">Recalculating with the new settings…</p>}
        <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div className="rounded-xl border border-cream-dark bg-cream/50 p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold text-navy">The example</h2>
            <p className="mt-2 text-sm text-navy">{result.scenario.description}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {[result.scenario.taskType, result.scenario.complexity, result.scenario.inputLength + ' input'].map(label => (
                <span key={label} className="rounded-full bg-cream-dark px-3 py-1 font-mono text-navy">{label}</span>
              ))}
            </div>
            <p className="mt-4 text-sm text-grey-blue">{focuses[result.request.focus].note}</p>
          </div>
          <div className="rounded-xl border border-cream-dark bg-white p-5 sm:p-6">
            <h2 className="mb-4 font-display text-xl font-bold text-navy">Effective priorities</h2>
            <FactorBars values={result.effectiveWeights} isWeight />
            <p className="mt-3 text-xs text-grey-blue">Weights include the real complexity adjustment.</p>
          </div>
        </section>
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl font-bold text-navy">The recommendation</h2>
              <p className="mt-1 text-sm text-grey-blue">
                {result.eligibleCount} eligible of {result.modelCount} catalogue models · {result.excludedCount} excluded
              </p>
            </div>
            <span className="font-mono text-xs text-grey-blue">Registry snapshot: {result.registryDate}</span>
          </div>
          {best ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ModelCard model={best} rank={1} reason="Highest weighted ranking for this particular example." />
              <div className="flex flex-col justify-center rounded-xl border border-cream-dark bg-cream/50 p-5">
                <h3 className="font-display text-lg font-bold text-navy">What was filtered out?</h3>
                {Object.keys(result.excludedByReason).length ? (
                  <ul className="mt-3 space-y-2 text-sm text-grey-blue">
                    {Object.entries(result.excludedByReason).map(([reason, count]) => (
                      <li key={reason} className="flex justify-between gap-3">
                        <span>{EXCLUSION_LABELS[reason] ?? reason}</span>
                        <strong className="font-mono text-navy">{count}</strong>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-sm text-grey-blue">No models excluded.</p>}
                <p className="mt-4 text-xs text-grey-blue">
                  Eligibility constraints are hard gates; high scores cannot compensate for a missing requirement.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-cream-dark bg-white p-5 text-sm text-navy">
              No models satisfy these requirements in the committed catalogue. Change the local-only setting.
            </p>
          )}
          {alternatives.length > 0 && (
            <>
              <h3 className="mt-7 mb-3 font-display text-xl font-bold text-navy">Useful alternatives</h3>
              <div className="grid gap-4 lg:grid-cols-2">
                {alternatives.map(({ item, model }) => (
                  <ModelCard
                    key={item.slug}
                    model={model!}
                    rank={item.originalRank}
                    featured={item.label}
                    reason={item.reason}
                  />
                ))}
              </div>
            </>
          )}
          <h3 className="mt-7 mb-3 font-display text-xl font-bold text-navy">Other eligible models</h3>
          <div className="overflow-x-auto rounded-xl border border-cream-dark bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-cream-dark bg-cream/50 text-navy">
                <tr>
                  <th scope="col" className="p-3">Rank</th>
                  <th scope="col" className="p-3">Model</th>
                  <th scope="col" className="p-3">Score</th>
                  <th scope="col" className="p-3">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {result.models.slice(1, 10).map((model, idx) => (
                  <tr key={model.slug} className="border-b border-cream-dark/70 last:border-b-0">
                    <td className="p-3 font-mono text-grey-blue">{idx + 2}</td>
                    <td className="p-3">
                      <Link href={'/models/' + model.slug} className="font-medium text-navy hover:underline">
                        {model.name}
                      </Link>
                      <span className="ml-2 text-xs text-grey-blue">{model.provider}</span>
                    </td>
                    <td className="p-3 font-mono text-navy">{model.weightedScore.toFixed(3)}</td>
                    <td className="p-3 font-mono text-grey-blue">{currency(model.estimatedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <footer className="mt-8 rounded-xl border border-cream-dark bg-cream/50 p-5 text-sm text-grey-blue">
        <h2 className="font-display text-base font-bold text-navy">What this workbench does — and doesn&apos;t — show</h2>
        <p className="mt-2">
          The sample descriptions are already classified. This does not call a classifier,
          execute models, use live benchmarks, save choices or update production rankings.
          The snapshot may be older than current provider data; estimated costs are illustrative.
          A ranking score is not the probability of success.
        </p>
        <p className="mt-3">
          See a questionable assumption?{' '}
          <a href="https://github.com/tomcwxyz/bearing/issues/new/choose" target="_blank" rel="noopener noreferrer" className="font-medium text-teal underline-offset-2 hover:underline">
            Challenge the methodology on GitHub
          </a>
          .
        </p>
      </footer>
    </div>
  )
}
