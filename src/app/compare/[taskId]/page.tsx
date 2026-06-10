'use client'

import { useState, useEffect, useTransition, useRef, use } from 'react'
import Link from 'next/link'
import { getResults, startComparison, runComparison, checkAuth } from '@/app/actions'
import { LoadingIndicator } from '@/components/loading-indicator'
import type { ScoredModel } from '@/lib/scoring'

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

const DEFAULT_PROMPTS: Record<string, string> = {
  coding: 'Write a well-structured function that solves the following problem, with comments explaining your approach.',
  writing: 'Write a clear, engaging piece on the following topic. Focus on structure and readability.',
  analysis: 'Analyze the following and provide key insights with supporting reasoning.',
  reasoning: 'Think through this problem step by step and provide a well-reasoned answer.',
}

export default function ComparePage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params)
  const [models, setModels] = useState<ScoredModel[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Load data once on mount. A ref guard (not state) so the run-once check
  // doesn't itself trigger a render / set-state-in-effect.
  const hasLoaded = useRef(false)
  useEffect(() => {
    if (hasLoaded.current) return
    hasLoaded.current = true
    startTransition(async () => {
      const authResult = await checkAuth()
      setIsAuthenticated(authResult.authenticated)

      const result = await getResults(taskId)
      if ('error' in result && result.error) {
        setError(result.error)
      } else {
        const r = result as unknown as { task: { task_type: string }; models: ScoredModel[] }
        setModels(r.models)
        setPrompt(DEFAULT_PROMPTS[r.task.task_type] || DEFAULT_PROMPTS.reasoning)
      }
    })
  }, [taskId, startTransition])

  function toggleModel(slug: string) {
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug)
      if (prev.length >= 2) return [prev[1], slug]
      return [...prev, slug]
    })
  }

  // Rough token estimate: ~4 chars per token for English text
  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  // Find the smallest context window among selected models
  const selectedModels = selected.map((s) => models.find((m) => m.slug === s)).filter(Boolean) as ScoredModel[]
  const minContextWindow = selectedModels.length > 0
    ? Math.min(...selectedModels.map((m) => m.contextWindow))
    : Infinity
  const estimatedTokenCount = estimateTokens(prompt)
  // Warn if prompt alone uses more than 80% of the smallest context window (leaving room for output)
  const promptTooLong = minContextWindow < Infinity && estimatedTokenCount > minContextWindow * 0.8

  function handleCompare() {
    if (selected.length !== 2 || !prompt.trim()) return
    setError(null)
    startTransition(async () => {
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

      // Store results in sessionStorage and navigate
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

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-20">
          <LoadingIndicator size="md" label="Loading comparison setup..." />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto text-center py-16">
          <h2 className="text-2xl font-bold mb-4 font-display text-navy">Sign in to compare models</h2>
          <p className="text-navy/70 mb-8">
            Compare mode lets you send the same prompt to two models and see their responses side by side.
          </p>
          <Link
            href={`/auth/signin?redirect=/compare/${taskId}`}
            className="btn-primary"
          >
            Sign in to continue
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href={`/recommend/${taskId}/results`}
          className="text-sm text-teal hover:underline mb-4 inline-block"
        >
          &larr; Back to results
        </Link>
        <h2 className="text-2xl font-bold mb-2 font-display text-navy">Compare models</h2>
        <p className="text-navy/70 mb-6">
          Pick two models to test head-to-head with the same prompt.
          <span className="text-grey-blue text-sm ml-2">(2 comparisons per day)</span>
        </p>

        {error && (
          <div role="alert" className="mb-6 rounded-lg border border-coral/30 bg-coral/5 p-4">
            <p className="text-sm text-coral">{error}</p>
          </div>
        )}

        {/* Model selection */}
        <div className="space-y-3 mb-8">
          {models.map((model, index) => {
            const rank = index + 1
            const isSelected = selected.includes(model.slug)
            const matchPercent = Math.min(100, Math.round(model.weightedScore * 100))

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
                      {isSelected ? '\u2713' : rank}
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
                  <span className="font-mono text-lg font-bold text-navy">{matchPercent}%</span>
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
              This prompt will be sent to both models. Edit it to match your use case.
            </p>
            <textarea
              id="compare-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              disabled={isPending}
              className="w-full rounded-lg border border-cream-dark bg-white p-4 text-navy font-body text-sm resize-y focus:border-teal focus:ring-1 focus:ring-teal"
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
            <p className="text-sm text-coral font-semibold mb-1">Prompt may be too long</p>
            <p className="text-sm text-coral/80">
              Your prompt is ~{estimatedTokenCount.toLocaleString()} tokens, but the smallest selected model
              only supports {minContextWindow.toLocaleString()} tokens (including the response).
              Consider shortening your prompt or choosing a model with a larger context window.
            </p>
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
