'use client'

import { useState, useTransition } from 'react'
import { routeAndRun, checkAuth, requestMagicLink } from '@/app/actions'
import type { Factor } from '@/lib/registry'
import { LoadingIndicator } from '@/components/loading-indicator'

const FACTOR_LABELS: Record<Factor, string> = {
  cost: 'cost',
  speed: 'speed',
  quality: 'quality',
  privacy: 'privacy',
  sustainability: 'sustainability',
  transparency: 'transparency',
  capability: 'capability',
}

interface RunResult {
  modelName: string
  provider: string
  factorScores: Record<string, number>
  response?: string
  error?: string
  estCost: number
  estCo2g: number | null
  latencyMs: number
}

/** Highest-scoring factor for the routed model — the headline "why". */
function topFactor(factorScores: Record<string, number>): string {
  const entries = Object.entries(factorScores)
  if (entries.length === 0) return 'overall fit'
  const [factor] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))
  return FACTOR_LABELS[factor as Factor] ?? factor
}

export function RunPanel({ taskId, topModelName }: { taskId: string; topModelName: string }) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Inline magic-link sign-in (routeAndRun requires auth, like /compare).
  const [showSignIn, setShowSignIn] = useState(false)
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  function handleRun() {
    if (!prompt.trim()) return
    setError(null)
    startTransition(async () => {
      const auth = await checkAuth()
      if (!auth.authenticated) {
        setShowSignIn(true)
        return
      }
      const formData = new FormData()
      formData.set('prompt', prompt.trim())
      if (file) formData.set('file', file)
      const res = await routeAndRun(taskId, formData)
      if ('error' in res && res.error && !('modelName' in res)) {
        setError(res.error)
        return
      }
      setResult(res as RunResult)
    })
  }

  function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await requestMagicLink(email.trim(), `/recommend/${taskId}/results`)
      if (res.error) setError(res.error)
      else setEmailSent(true)
    })
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

  return (
    <div className="mt-4 w-full rounded-lg border border-teal/30 bg-teal/5 p-4 fade-in">
      <p className="mb-2 font-display text-sm font-semibold text-navy">
        Run your prompt on {topModelName}
      </p>
      <p className="mb-3 text-xs text-grey-blue">
        Bearing routes to the model ranked #1 for your task and priorities, and runs it for you.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        disabled={isPending}
        placeholder="Enter the prompt you actually want to run..."
        className="w-full rounded-lg border border-cream-dark bg-white p-3 text-sm text-navy resize-y focus:border-teal focus:ring-1 focus:ring-teal focus:outline-none"
      />

      {/* Optional file attachment (PDF/CSV), same constraints as /compare. */}
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
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setFileError(null)
                if (f.size > 5 * 1024 * 1024) { setFileError('File must be under 5MB.'); return }
                const ext = f.name.split('.').pop()?.toLowerCase()
                if (ext !== 'pdf' && ext !== 'csv') { setFileError('Only PDF or CSV files are supported.'); return }
                setFile(f)
              }}
            />
          </label>
        )}
        {fileError && <p className="mt-1 text-xs text-coral">{fileError}</p>}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-coral">{error}</p>}

      {/* Inline sign-in */}
      {showSignIn && (
        <div className="mt-3 rounded-lg border border-teal/30 bg-white p-3">
          {emailSent ? (
            <p className="text-sm text-teal">Check your email for a sign-in link, then come back and run.</p>
          ) : (
            <form onSubmit={handleSignIn} className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 rounded-md border border-cream-dark bg-cream px-3 py-2 text-sm text-navy focus:border-teal focus:outline-none"
              />
              <button type="submit" disabled={isPending} className="btn-primary text-sm disabled:opacity-50">
                {isPending ? 'Sending...' : 'Sign in'}
              </button>
            </form>
          )}
        </div>
      )}

      {!showSignIn && (
        <button
          type="button"
          onClick={handleRun}
          disabled={isPending || !prompt.trim()}
          className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-semibold font-display text-cream transition-colors hover:bg-navy-light disabled:opacity-40"
        >
          {isPending ? 'Running...' : 'Route & run'}
        </button>
      )}

      {isPending && !result && (
        <div className="mt-4"><LoadingIndicator size="sm" label="Routing and running..." /></div>
      )}

      {result && (
        <div className="mt-4 fade-in">
          <div className="mb-2 inline-flex flex-wrap items-center gap-2 rounded-full bg-navy/5 px-3 py-1 text-xs text-navy/70">
            <span>
              Routed to <strong className="text-navy">{result.modelName}</strong> — ranked #1 on your priorities
              {' '}(strongest on {topFactor(result.factorScores)})
            </span>
          </div>
          <p className="mb-3 font-mono text-xs text-grey-blue">
            {result.estCo2g != null ? `~${result.estCo2g.toFixed(2)} gCO₂e · ` : ''}
            ~${result.estCost.toFixed(4)}/task · {(result.latencyMs / 1000).toFixed(1)}s
          </p>
          {result.error ? (
            <p className="text-sm text-coral">{result.error}</p>
          ) : (
            <div className="whitespace-pre-wrap rounded-lg border border-cream-dark bg-white p-4 text-sm text-navy">
              {result.response}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
