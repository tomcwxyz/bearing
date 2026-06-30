'use client'

import { useState, useTransition } from 'react'
import { runTrio, checkAuth, requestMagicLink, submitRoutedPreference } from '@/app/actions'
import { LoadingIndicator } from '@/components/loading-indicator'

interface TrioCandidate {
  slug: string
  name: string
  provider: string
  routeRank: number
  response?: string
  error?: string
  estCost: number
  estCo2g: number | null
}

interface TrioResult {
  routedRunId: string
  candidates: TrioCandidate[]
  verdict: { winnerSlug: string; winnerName: string; reason: string; judgeModel: string } | null
}

export function TrioPanel({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [result, setResult] = useState<TrioResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [showSignIn, setShowSignIn] = useState(false)
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const [preferred, setPreferred] = useState<string | null>(null)

  function handlePreference(slug: string) {
    if (!result || preferred) return
    setPreferred(slug)
    startTransition(async () => {
      await submitRoutedPreference(result.routedRunId, slug, null)
    })
  }

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
      const res = await runTrio(taskId, formData)
      if ('error' in res && res.error && !('candidates' in res)) {
        setError(res.error)
        return
      }
      setResult(res as TrioResult)
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
      <div className="mt-8 text-center">
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary">
          Run the top 3 and let a judge pick
        </button>
      </div>
    )
  }

  return (
    <div className="mt-8 rounded-xl border border-cream-dark bg-white p-5 fade-in">
      <h3 className="font-display text-lg font-bold text-navy">Trio mode</h3>
      <p className="mt-1 mb-3 text-sm text-grey-blue">
        Bearing sends your prompt to the top 3 ranked models, then a blind judge picks the best answer
        without knowing which model wrote which.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        disabled={isPending}
        placeholder="Enter the prompt to send to all three models..."
        className="w-full rounded-lg border border-cream-dark bg-white p-3 text-sm text-navy resize-y focus:border-teal focus:ring-1 focus:ring-teal focus:outline-none"
      />

      <div className="mt-3">
        {file ? (
          <div className="flex items-center gap-2 rounded-lg border border-teal/30 bg-teal/5 px-3 py-2 text-xs">
            <span className="text-navy">{file.name}</span>
            <span className="text-navy/50">({(file.size / 1024).toFixed(0)} KB)</span>
            <button type="button" onClick={() => { setFile(null); setFileError(null) }} className="ml-auto text-coral/70 hover:text-coral">
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

      {showSignIn && (
        <div className="mt-3 rounded-lg border border-teal/30 bg-teal/5 p-3">
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
          {isPending ? 'Running all three...' : 'Run Trio'}
        </button>
      )}

      {isPending && !result && (
        <div className="mt-4"><LoadingIndicator size="sm" label="Running all three and judging..." /></div>
      )}

      {result && (
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

          <div className="grid gap-3 md:grid-cols-3">
            {result.candidates.map((c) => {
              const isWinner = result.verdict?.winnerSlug === c.slug
              return (
                <div
                  key={c.slug}
                  className={`rounded-lg border p-3 ${isWinner ? 'border-coral border-2 bg-coral/5' : 'border-cream-dark bg-white'}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-display text-sm font-bold text-navy">{c.name}</span>
                    <span className="text-xs text-navy/40">#{c.routeRank}</span>
                  </div>
                  <p className="mb-2 font-mono text-[11px] text-grey-blue">
                    {c.estCo2g != null ? `~${c.estCo2g.toFixed(2)} gCO₂e · ` : ''}~${c.estCost.toFixed(4)}/task
                  </p>
                  {c.error ? (
                    <p className="text-xs text-coral">{c.error}</p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-xs text-navy">
                      {c.response}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Human preference — the verdict that pairs with the blind judge. */}
          <div className="mt-4 rounded-lg border border-cream-dark bg-cream/50 p-4">
            {preferred ? (
              <p className="text-sm text-teal">
                Thanks — recorded your preference for{' '}
                <strong>
                  {preferred === 'tie'
                    ? 'a tie'
                    : result.candidates.find((c) => c.slug === preferred)?.name ?? preferred}
                </strong>
                . This feeds Bearing&apos;s open preference dataset.
              </p>
            ) : (
              <>
                <p className="mb-2 font-display text-sm font-semibold text-navy">Which answer did you prefer?</p>
                <div className="flex flex-wrap gap-2">
                  {result.candidates.filter((c) => !c.error && c.response?.trim()).map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => handlePreference(c.slug)}
                      disabled={isPending}
                      className="rounded-full border border-navy px-4 py-1.5 text-sm font-medium text-navy transition-colors hover:bg-navy hover:text-cream disabled:opacity-50"
                    >
                      {c.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handlePreference('tie')}
                    disabled={isPending}
                    className="rounded-full border border-cream-dark px-4 py-1.5 text-sm font-medium text-navy/70 transition-colors hover:border-navy disabled:opacity-50"
                  >
                    Tie / no preference
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
