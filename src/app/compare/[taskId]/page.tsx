'use client'

import { useState, useEffect, useTransition, use } from 'react'
import Link from 'next/link'
import { getResults, startComparison, runComparison, checkAuth } from '@/app/actions'
import type { ScoredModel } from '@/lib/scoring'

const DEFAULT_PROMPTS: Record<string, string> = {
  coding: 'Write a well-structured function that solves the following problem, with comments explaining your approach.',
  writing: 'Write a clear, engaging piece on the following topic. Focus on structure and readability.',
  analysis: 'Analyze the following and provide key insights with supporting reasoning.',
  reasoning: 'Think through this problem step by step and provide a well-reasoned answer.',
}

export default function ComparePage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params)
  const [models, setModels] = useState<ScoredModel[]>([])
  const [taskType, setTaskType] = useState<string>('')
  const [selected, setSelected] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Load data on mount
  useEffect(() => {
    if (loaded) return
    setLoaded(true)
    startTransition(async () => {
      const authResult = await checkAuth()
      setIsAuthenticated(authResult.authenticated)

      const result = await getResults(taskId)
      if ('error' in result && result.error) {
        setError(result.error)
      } else {
        const r = result as unknown as { task: { task_type: string }; models: ScoredModel[] }
        setModels(r.models)
        setTaskType(r.task.task_type)
        setPrompt(DEFAULT_PROMPTS[r.task.task_type] || DEFAULT_PROMPTS.reasoning)
      }
    })
  }, [loaded, taskId, startTransition])

  function toggleModel(slug: string) {
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug)
      if (prev.length >= 2) return [prev[1], slug]
      return [...prev, slug]
    })
  }

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
      const runResult = await runComparison(comparisonId, prompt.trim())
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
        <div className="max-w-3xl mx-auto">
          <p className="text-grey-blue">Loading...</p>
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
          <div className="mb-6 rounded-lg border border-coral/30 bg-coral/5 p-4">
            <p className="text-sm text-coral">{error}</p>
          </div>
        )}

        {/* Model selection */}
        <div className="space-y-3 mb-8">
          {models.map((model, index) => {
            const rank = index + 1
            const isSelected = selected.includes(model.slug)
            const matchPercent = Math.round(model.weightedScore * 100)

            return (
              <button
                key={model.slug}
                type="button"
                onClick={() => toggleModel(model.slug)}
                disabled={isPending}
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

        {isPending && (
          <div className="mt-6 rounded-lg border border-teal/30 bg-teal/5 p-6 text-center">
            <p className="text-navy/70 font-display">
              Sending prompt to both models...
            </p>
            <p className="text-sm text-grey-blue mt-1">This may take a moment</p>
          </div>
        )}
      </div>
    </div>
  )
}
