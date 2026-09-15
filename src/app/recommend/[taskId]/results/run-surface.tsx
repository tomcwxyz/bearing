'use client'

import { useState, useTransition } from 'react'
import { checkAuth, signInWithPassword } from '@/app/actions'
import { challengeAnswer, runInformationTrio } from '@/features/runs/actions'
import { routeAndRun, submitRoutedPreference } from '@/features/runs/route-actions'
import type { Factor } from '@/lib/registry'
import { LoadingIndicator } from '@/components/loading-indicator'
import { CredentialsForm } from '@/components/credentials-form'

type Mode = 'route' | 'trio'

const FACTOR_LABELS: Record<Factor, string> = {
  cost: 'cost',
  speed: 'speed',
  quality: 'quality',
  privacy: 'privacy',
  sustainability: 'sustainability',
  transparency: 'transparency',
  capability: 'capability',
}

function topFactor(factorScores: Record<string, number>): string {
  const entries = Object.entries(factorScores)
  if (entries.length === 0) return 'overall fit'
  const [factor] = entries.reduce((best, current) => (current[1] > best[1] ? current : best))
  return FACTOR_LABELS[factor as Factor] ?? factor
}

interface RouteResult {
  modelSlug: string
  modelName: string
  provider: string
  factorScores: Record<string, number>
  response?: string
  error?: string
  estCost: number
  estCo2g: number | null
  latencyMs: number
}

interface ExperimentCandidate {
  slug: string
  name: string
  provider: string
  routeRank: number
  role: 'candidate' | 'primary' | 'challenger'
  selectionReason?: string
  response?: string
  error?: string
  estCost: number
  estCo2g: number | null
  reused?: boolean
}

interface ExperimentResult {
  routedRunId: string
  candidates: ExperimentCandidate[]
  verdict: { winnerSlug: string; winnerName: string; reason: string; judgeModel: string } | null
}

const MODE_LABEL: Record<Mode, string> = {
  route: 'Run this model',
  trio: 'Trio',
}

function modeDescription(mode: Mode, modelName: string): string {
  if (mode === 'route') return `Runs your prompt on ${modelName}.`
  return `Starts with ${modelName}, then Bearing chooses up to two credible alternatives that maximise what the comparison can teach — for example a different provider, a cheaper option, or a local-vs-hosted trade-off.`
}

const MODE_PLACEHOLDER: Record<Mode, string> = {
  route: 'Enter the prompt you actually want to run...',
  trio: 'Enter the prompt to test across an informative Trio...',
}

function ExperimentResults({
  result,
  preferred,
  pending,
  onPreference,
}: {
  result: ExperimentResult
  preferred: string | null
  pending: boolean
  onPreference: (result: ExperimentResult, slug: string) => void
}) {
  return (
    <div className="mt-5 fade-in">
      {result.verdict && (
        <div className="mb-4 rounded-lg border border-coral/30 bg-coral/5 p-4">
          <p className="font-display text-sm font-semibold text-navy">
            Judge&apos;s pick: {result.verdict.winnerName}
          </p>
          <p className="mt-1 text-sm text-navy/70 italic">{result.verdict.reason}</p>
          <p className="mt-1 text-xs text-grey-blue">Judged blind by {result.verdict.judgeModel}</p>
        </div>
      )}

      <div className={`grid gap-3 ${result.candidates.length <= 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        {result.candidates.map((candidate) => {
          const isWinner = result.verdict?.winnerSlug === candidate.slug
          const roleLabel = candidate.reused
            ? 'Existing answer'
            : candidate.role === 'primary'
              ? 'Selected'
              : candidate.role === 'challenger'
                ? 'Challenger'
                : `Recommendation #${candidate.routeRank}`

          return (
            <div
              key={candidate.slug}
              className={`rounded-lg border p-3 ${isWinner ? 'border-coral border-2 bg-coral/5' : 'border-cream-dark bg-white'}`}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="font-display text-sm font-bold text-navy">{candidate.name}</span>
                <span className="text-right text-xs text-navy/40">{roleLabel}</span>
              </div>

              {candidate.selectionReason && (
                <p className="mb-2 text-[11px] leading-relaxed text-teal">
                  Why this model: {candidate.selectionReason}
                </p>
              )}

              <p className="mb-2 font-mono text-[11px] text-grey-blue">
                {candidate.reused
                  ? 'Already run · no duplicate inference'
                  : `${candidate.estCo2g != null ? `~${candidate.estCo2g.toFixed(2)} gCO₂e · ` : ''}~$${candidate.estCost.toFixed(4)}/task`}
              </p>

              {candidate.error ? (
                <p className="text-xs text-coral">{candidate.error}</p>
              ) : (
                <div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-xs text-navy">
                  {candidate.response}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 rounded-lg border border-cream-dark bg-cream/50 p-4">
        {preferred ? (
          <p className="text-sm text-teal">
            Thanks — recorded your preference for{' '}
            <strong>
              {preferred === 'tie'
                ? 'a tie'
                : result.candidates.find((candidate) => candidate.slug === preferred)?.name ?? preferred}
            </strong>
            . This feeds Bearing&apos;s open preference dataset.
          </p>
        ) : (
          <>
            <p className="mb-2 font-display text-sm font-semibold text-navy">Which answer did you prefer?</p>
            <div className="flex flex-wrap gap-2">
              {result.candidates.filter((candidate) => !candidate.error && candidate.response?.trim()).map((candidate) => (
                <button
                  key={candidate.slug}
                  type="button"
                  onClick={() => onPreference(result, candidate.slug)}
                  disabled={pending}
                  className="rounded-full border border-navy px-4 py-1.5 text-sm font-medium text-navy transition-colors hover:bg-navy hover:text-cream disabled:opacity-50"
                >
                  {candidate.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onPreference(result, 'tie')}
                disabled={pending}
                className="rounded-full border border-cream-dark px-4 py-1.5 text-sm font-medium text-navy/70 transition-colors hover:border-navy disabled:opacity-50"
              >
                Tie / no preference
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function RunSurface({ taskId, modelSlug, modelName }: { taskId: string; modelSlug: string; modelName: string }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('route')
  const [prompt, setPrompt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null)
  const [trioResult, setTrioResult] = useState<ExperimentResult | null>(null)
  const [challengeResult, setChallengeResult] = useState<ExperimentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showSignIn, setShowSignIn] = useState(false)
  const [preferred, setPreferred] = useState<string | null>(null)

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setRouteResult(null)
    setTrioResult(null)
    setChallengeResult(null)
    setError(null)
    setPreferred(null)
  }

  function handlePreference(result: ExperimentResult, slug: string) {
    if (preferred) return
    setPreferred(slug)
    startTransition(async () => {
      await submitRoutedPreference(result.routedRunId, slug, null)
    })
  }

  function buildFormData() {
    const formData = new FormData()
    formData.set('prompt', prompt.trim())
    formData.set('modelSlug', modelSlug)
    if (file) formData.set('file', file)
    return formData
  }

  function handleRun() {
    if (!prompt.trim()) return
    setError(null)
    setChallengeResult(null)
    setPreferred(null)

    startTransition(async () => {
      const auth = await checkAuth()
      if (!auth.authenticated) {
        setShowSignIn(true)
        return
      }

      const formData = buildFormData()
      if (mode === 'route') {
        const response = await routeAndRun(taskId, formData)
        if ('error' in response && response.error && !('modelName' in response)) {
          setError(response.error)
          return
        }
        setRouteResult(response as RouteResult)
        return
      }

      const response = await runInformationTrio(taskId, formData)
      if ('error' in response && response.error && !('candidates' in response)) {
        setError(response.error)
        return
      }
      setTrioResult(response as ExperimentResult)
    })
  }

  function handleChallenge() {
    if (!routeResult?.response?.trim()) return
    setError(null)
    setPreferred(null)

    startTransition(async () => {
      const formData = buildFormData()
      formData.set('primaryResponse', routeResult.response!.trim())
      const response = await challengeAnswer(taskId, formData)
      if ('error' in response && response.error && !('candidates' in response)) {
        setError(response.error)
        return
      }
      setChallengeResult(response as ExperimentResult)
    })
  }

  function handleSignedIn() {
    setShowSignIn(false)
    handleRun()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-teal px-4 py-2 text-sm font-medium font-display text-teal transition-colors hover:bg-teal hover:text-cream"
      >
        Run this prompt
      </button>
    )
  }

  const hasResult = mode === 'route' ? routeResult !== null : trioResult !== null

  return (
    <div className="mt-4 w-full rounded-lg border border-teal/30 bg-teal/5 p-4 fade-in">
      <div className="mb-3 inline-flex rounded-lg border border-cream-dark bg-white p-0.5">
        {(['route', 'trio'] as Mode[]).map((candidateMode) => (
          <button
            key={candidateMode}
            type="button"
            onClick={() => switchMode(candidateMode)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === candidateMode ? 'bg-navy text-cream' : 'text-navy/60 hover:text-navy'
            }`}
          >
            {MODE_LABEL[candidateMode]}
          </button>
        ))}
      </div>

      <p className="mb-2 font-display text-sm font-semibold text-navy">
        {mode === 'route' ? `Run your prompt on ${modelName}` : 'Run an informative Trio'}
      </p>
      <p className="mb-3 text-xs text-grey-blue">{modeDescription(mode, modelName)}</p>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={4}
        disabled={isPending}
        placeholder={MODE_PLACEHOLDER[mode]}
        className="w-full resize-y rounded-lg border border-cream-dark bg-white p-3 text-sm text-navy focus:border-teal focus:ring-1 focus:ring-teal focus:outline-none"
      />

      <div className="mt-3">
        {file ? (
          <div className="flex items-center gap-2 rounded-lg border border-teal/30 bg-white px-3 py-2 text-xs">
            <span className="text-navy">{file.name}</span>
            <span className="text-navy/50">({(file.size / 1024).toFixed(0)} KB)</span>
            <button
              type="button"
              onClick={() => { setFile(null); setFileError(null) }}
              className="ml-auto text-coral/70 hover:text-coral"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-cream-dark px-3 py-2 text-xs text-navy/50 transition-colors hover:border-teal hover:text-teal">
            <span>Attach a PDF or CSV (optional, max 5MB)</span>
            <input
              type="file"
              accept=".pdf,.csv"
              className="hidden"
              disabled={isPending}
              onChange={(event) => {
                const selected = event.target.files?.[0]
                if (!selected) return
                setFileError(null)
                if (selected.size > 5 * 1024 * 1024) {
                  setFileError('File must be under 5MB.')
                  return
                }
                const extension = selected.name.split('.').pop()?.toLowerCase()
                if (extension !== 'pdf' && extension !== 'csv') {
                  setFileError('Only PDF or CSV files are supported.')
                  return
                }
                setFile(selected)
              }}
            />
          </label>
        )}
        {fileError && <p className="mt-1 text-xs text-coral">{fileError}</p>}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-coral">{error}</p>}

      {showSignIn && (
        <div className="mt-3 rounded-lg border border-teal/30 bg-white p-3">
          <p className="mb-2 text-sm font-medium text-navy">Sign in to run this</p>
          <CredentialsForm
            onSubmit={signInWithPassword}
            onSuccess={handleSignedIn}
            submitLabel="Sign in & run"
            pendingLabel="Signing in..."
          />
        </div>
      )}

      {!showSignIn && (
        <button
          type="button"
          onClick={handleRun}
          disabled={isPending || !prompt.trim()}
          className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-semibold font-display text-cream transition-colors hover:bg-navy-light disabled:opacity-40"
        >
          {isPending && !challengeResult
            ? (mode === 'route' ? 'Running...' : 'Running informative Trio...')
            : (mode === 'route' ? 'Route & run' : 'Run Trio')}
        </button>
      )}

      {isPending && !hasResult && (
        <div className="mt-4"><LoadingIndicator size="sm" label="Routing and running..." /></div>
      )}

      {mode === 'route' && routeResult && (
        <div className="mt-4 fade-in">
          <div className="mb-2 inline-flex flex-wrap items-center gap-2 rounded-full bg-navy/5 px-3 py-1 text-xs text-navy/70">
            <span>
              Ran on <strong className="text-navy">{routeResult.modelName}</strong>{' '}
              (strongest on {topFactor(routeResult.factorScores)})
            </span>
          </div>
          <p className="mb-3 font-mono text-xs text-grey-blue">
            {routeResult.estCo2g != null ? `~${routeResult.estCo2g.toFixed(2)} gCO₂e · ` : ''}
            ~${routeResult.estCost.toFixed(4)}/task · {(routeResult.latencyMs / 1000).toFixed(1)}s
          </p>

          {routeResult.error ? (
            <p className="text-sm text-coral">{routeResult.error}</p>
          ) : (
            <>
              <div className="whitespace-pre-wrap rounded-lg border border-cream-dark bg-white p-4 text-sm text-navy">
                {routeResult.response}
              </div>

              {!challengeResult && routeResult.response?.trim() && (
                <div className="mt-4 rounded-lg border border-coral/30 bg-coral/5 p-4">
                  <p className="font-display text-sm font-semibold text-navy">
                    Want Bearing to challenge this answer with a strong alternative?
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-navy/65">
                    Bearing will choose an alternative because the comparison is informative — not simply because it is next in the ranking — then ask it to critique material gaps and produce a better answer if it can.
                  </p>
                  <button
                    type="button"
                    onClick={handleChallenge}
                    disabled={isPending}
                    className="mt-3 rounded-lg border border-coral px-4 py-2 text-sm font-semibold font-display text-coral transition-colors hover:bg-coral hover:text-white disabled:opacity-40"
                  >
                    {isPending ? 'Challenging...' : 'Challenge this answer'}
                  </button>
                </div>
              )}

              {challengeResult && (
                <ExperimentResults
                  result={challengeResult}
                  preferred={preferred}
                  pending={isPending}
                  onPreference={handlePreference}
                />
              )}
            </>
          )}
        </div>
      )}

      {mode === 'trio' && trioResult && (
        <ExperimentResults
          result={trioResult}
          preferred={preferred}
          pending={isPending}
          onPreference={handlePreference}
        />
      )}
    </div>
  )
}
