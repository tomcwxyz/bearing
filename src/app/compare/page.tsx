'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import {
  getModelsForCompare,
  checkAuth,
  createDirectCompareTask,
  startComparison,
  runComparison,
  requestMagicLink,
} from '@/app/actions'
import { LoadingIndicator } from '@/components/loading-indicator'

interface CompareModel {
  slug: string
  name: string
  provider: string
  tier: string
  capabilities: string[]
  contextWindow: number
}

const STORAGE_KEY = 'direct-compare-state'

function ComparisonProgress() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const steps = [
    { label: 'Checking prompt safety', threshold: 0 },
    { label: 'Sending prompt to both models', threshold: 2 },
    { label: 'Waiting for responses', threshold: 5 },
    { label: 'Still waiting — large models can take a while', threshold: 15 },
  ]

  const current = [...steps].reverse().find((s) => elapsed >= s.threshold)!

  return (
    <div className="mt-6 rounded-lg border border-teal/30 bg-teal/5 p-8 fade-in" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <LoadingIndicator size="md" />
        <div className="text-center">
          <p className="text-navy/70 font-display stage-text" key={current.label}>
            {current.label}...
          </p>
          <p className="mt-2 text-sm text-grey-blue">{elapsed}s elapsed</p>
        </div>
      </div>
    </div>
  )
}

export default function DirectComparePage() {
  const [models, setModels] = useState<CompareModel[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')
  const [search, setSearch] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [showSignIn, setShowSignIn] = useState(false)
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const loadedRef = useRef(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Load models and auth state on mount
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    startTransition(async () => {
      const [authResult, modelsResult] = await Promise.all([
        checkAuth(),
        getModelsForCompare(),
      ])
      setIsAuthenticated(authResult.authenticated)
      if ('models' in modelsResult && modelsResult.models) {
        setModels(modelsResult.models)
      }

      // Restore state from localStorage (after auth redirect — may be a new tab)
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const state = JSON.parse(saved)
          if (state.selected) setSelected(state.selected)
          if (state.prompt) setPrompt(state.prompt)
          localStorage.removeItem(STORAGE_KEY)
        } catch { /* ignore corrupt data */ }
      }
    })
  }, [startTransition])

  function toggleModel(slug: string) {
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug)
      if (prev.length >= 2) return [prev[1], slug]
      return [...prev, slug]
    })
  }

  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  const selectedModels = selected.map((s) => models.find((m) => m.slug === s)).filter(Boolean) as CompareModel[]
  const minContextWindow = selectedModels.length > 0
    ? Math.min(...selectedModels.map((m) => m.contextWindow))
    : Infinity
  // Include any attached file in the estimate. We only have the byte size on
  // the client (extraction happens server-side), so ~4 bytes/token is a rough
  // upper bound — deliberately conservative so large files trigger the warning.
  const fileTokenEstimate = file ? Math.ceil(file.size / 4) : 0
  const estimatedTokenCount = estimateTokens(prompt) + fileTokenEstimate
  const promptTooLong = minContextWindow < Infinity && estimatedTokenCount > minContextWindow * 0.8

  const filtered = search.trim()
    ? models.filter((m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.provider.toLowerCase().includes(search.toLowerCase())
      )
    : models

  function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    // Save state before auth redirect — localStorage so it survives if magic link opens in a new tab
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected, prompt }))
    startTransition(async () => {
      const result = await requestMagicLink(email.trim(), '/compare')
      if (result.error) {
        setError(result.error)
      } else {
        setEmailSent(true)
      }
    })
  }

  function handleCompare() {
    if (selected.length !== 2 || !prompt.trim()) return

    if (!isAuthenticated) {
      setShowSignIn(true)
      return
    }

    setError(null)
    startTransition(async () => {
      // Create a lightweight task record for the FK
      const taskResult = await createDirectCompareTask()
      if (taskResult.error || !taskResult.taskId) {
        setError(taskResult.error || 'Failed to create comparison.')
        return
      }
      const taskId = taskResult.taskId

      const startResult = await startComparison(taskId, selected[0], selected[1])
      if ('error' in startResult && startResult.error) {
        setError(startResult.error)
        return
      }

      const comparisonId = startResult.comparisonId!
      const formData = new FormData()
      formData.set('prompt', prompt.trim())
      if (file) formData.set('file', file)
      const runResult = await runComparison(comparisonId, formData)
      if ('error' in runResult && runResult.error) {
        setError(runResult.error)
        return
      }

      sessionStorage.setItem(
        `comparison:${comparisonId}`,
        JSON.stringify({
          comparisonId,
          modelASlug: selected[0],
          modelBSlug: selected[1],
          modelAName: models.find((m) => m.slug === selected[0])?.name ?? selected[0],
          modelBName: models.find((m) => m.slug === selected[1])?.name ?? selected[1],
          responseA: runResult.responseA || '',
          responseB: runResult.responseB || '',
          errorA: runResult.errorA || '',
          errorB: runResult.errorB || '',
        }),
      )
      window.location.href = `/compare/${taskId}/results?cid=${comparisonId}`
    })
  }

  if (models.length === 0) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-20">
          <LoadingIndicator size="md" label="Loading models..." />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 font-display text-navy">Compare models</h1>
        <p className="text-navy/70 mb-8">
          Pick any two models, send them the same prompt, and see how they respond.
          <span className="text-grey-blue text-sm ml-2">(2 comparisons per day)</span>
        </p>

        {error && (
          <div role="alert" className="mb-6 rounded-lg border border-coral/30 bg-coral/5 p-4">
            <p className="text-sm text-coral">{error}</p>
          </div>
        )}

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            aria-label="Search models"
            className="w-full rounded-lg border border-cream-dark bg-white px-4 py-2.5 text-sm text-navy placeholder:text-navy/40 focus:border-teal focus:ring-1 focus:ring-teal focus:outline-none"
          />
        </div>

        {/* Selected summary */}
        {selected.length > 0 && (
          <div className="mb-4 flex items-center gap-2 text-sm text-navy/70">
            <span className="font-display font-semibold text-navy">Selected:</span>
            {selected.map((slug) => {
              const m = models.find((m) => m.slug === slug)
              return (
                <span
                  key={slug}
                  className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-3 py-1 text-teal font-medium"
                >
                  {m?.name ?? slug}
                  <button
                    type="button"
                    onClick={() => toggleModel(slug)}
                    className="ml-0.5 text-teal/60 hover:text-teal"
                  >
                    &times;
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {/* Model grid */}
        <div className="grid gap-2 mb-8" role="list" aria-label="Available models">
          {filtered.map((model) => {
            const isSelected = selected.includes(model.slug)

            return (
              <button
                key={model.slug}
                type="button"
                onClick={() => toggleModel(model.slug)}
                disabled={isPending}
                aria-label={`Select ${model.name}`}
                className={`w-full text-left rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'border-teal border-2 bg-teal/5 shadow-md'
                    : 'border-cream-dark bg-white hover:border-navy/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${
                        isSelected
                          ? 'bg-teal text-white'
                          : 'bg-cream-dark text-navy'
                      }`}
                    >
                      {isSelected ? '\u2713' : ''}
                    </span>
                    <div>
                      <span className="font-display font-bold text-navy">{model.name}</span>
                      <span className="text-navy/50 text-sm ml-2">{model.provider}</span>
                      {model.capabilities.includes('vision') && (
                        <span className="ml-2 rounded bg-teal/10 px-1.5 py-0.5 text-xs text-teal">Vision</span>
                      )}
                      <span className="ml-2 rounded bg-cream-dark px-1.5 py-0.5 text-xs text-navy/50 font-mono">
                        {model.contextWindow >= 1_000_000
                          ? `${(model.contextWindow / 1_000_000).toFixed(0)}M`
                          : `${Math.round(model.contextWindow / 1000)}k`} ctx
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Prompt */}
        {selected.length === 2 && (
          <div className="mb-6">
            <label htmlFor="compare-prompt" className="block font-display font-semibold text-navy mb-2">
              Prompt
            </label>
            <p className="text-sm text-navy/60 mb-2">
              This prompt will be sent to both models.
            </p>
            <textarea
              id="compare-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              disabled={isPending}
              className="w-full rounded-lg border border-cream-dark bg-white p-4 text-navy font-body text-sm resize-y focus:border-teal focus:ring-1 focus:ring-teal focus:outline-none"
              placeholder="Enter a prompt to test both models..."
            />

            {/* File attachment */}
            <div className="mt-4">
              <label className="block font-display font-semibold text-navy mb-2">
                Attach document <span className="font-normal text-navy/50">(optional)</span>
              </label>
              <p className="text-sm text-navy/60 mb-2">
                PDF or CSV, max 5MB. Vision models receive the raw file; others get extracted text.
              </p>
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border border-teal/30 bg-teal/5 px-4 py-3">
                  <span className="text-sm text-navy">{file.name}</span>
                  <span className="text-xs text-navy/50">({(file.size / 1024).toFixed(0)} KB)</span>
                  <button
                    type="button"
                    onClick={() => { setFile(null); setFileError(null) }}
                    className="ml-auto text-sm text-coral/70 hover:text-coral"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-cream-dark px-4 py-6 text-sm text-navy/50 transition-colors hover:border-teal hover:text-teal">
                  <span>Drop a file here or click to browse</span>
                  <input
                    type="file"
                    accept=".pdf,.csv"
                    className="hidden"
                    disabled={isPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      setFileError(null)
                      if (f.size > 5 * 1024 * 1024) {
                        setFileError('File must be under 5MB.')
                        return
                      }
                      const ext = f.name.split('.').pop()?.toLowerCase()
                      if (ext !== 'pdf' && ext !== 'csv') {
                        setFileError('Only PDF or CSV files are supported.')
                        return
                      }
                      setFile(f)
                    }}
                  />
                </label>
              )}
              {fileError && <p className="mt-2 text-sm text-coral">{fileError}</p>}
            </div>
          </div>
        )}

        {/* Prompt length warning */}
        {promptTooLong && selected.length === 2 && (
          <div className="mb-4 rounded-lg border border-coral/30 bg-coral/5 p-4">
            <p className="text-sm text-coral font-semibold mb-1">Input may be too long</p>
            <p className="text-sm text-coral/80">
              Your prompt{file ? ' and attached file' : ''} is ~{estimatedTokenCount.toLocaleString()} tokens, but the
              smallest selected model only supports {minContextWindow.toLocaleString()} tokens (including the response).
              Consider {file ? 'a smaller file, ' : ''}shortening your prompt, or choosing a model with a larger context window.
            </p>
          </div>
        )}

        {/* Inline sign-in */}
        {showSignIn && !isAuthenticated && (
          <div className="mb-6 rounded-lg border border-teal/30 bg-teal/5 p-6">
            {emailSent ? (
              <div>
                <p className="font-display font-semibold text-teal">Check your email</p>
                <p className="mt-1 text-sm text-navy/70">
                  We sent a sign-in link. After clicking it, you&apos;ll return here with your selections preserved.
                </p>
              </div>
            ) : (
              <>
                <p className="font-display font-semibold text-navy mb-1">Sign in to compare</p>
                <p className="text-sm text-navy/60 mb-4">
                  Quick sign-in with a magic link — no password needed. Your model selections will be preserved.
                </p>
                <form onSubmit={handleSignIn} className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="flex-1 rounded-md border border-cream-dark bg-cream px-3 py-2 text-sm text-navy placeholder:text-navy/40 focus:border-teal focus:ring-2 focus:ring-teal/30 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {isPending ? 'Sending...' : 'Send link'}
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {/* Compare button */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleCompare}
            disabled={selected.length !== 2 || !prompt.trim() || isPending}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Running comparison...' : 'Run comparison'}
          </button>
          {selected.length < 2 && (
            <p className="text-sm text-grey-blue">
              Select {2 - selected.length} more model{selected.length === 0 ? 's' : ''}
            </p>
          )}
        </div>

        {isPending && <ComparisonProgress />}
      </div>
    </div>
  )
}
