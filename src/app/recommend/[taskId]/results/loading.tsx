'use client'

import { StagedLoading } from '@/components/staged-loading'
import { StepProgress } from '@/components/step-progress'

const RESULTS_STAGES = [
  { label: 'Scoring models against your priorities...', after: 0 },
  { label: 'Ranking the best matches...', after: 3 },
  { label: 'Writing up reasoning for each pick...', after: 6 },
  { label: 'Almost there — polishing results...', after: 12 },
]

export default function ResultsLoading() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <StepProgress current="results" hideClarify />

        {/* Staged loading indicator */}
        <div className="flex flex-col items-center justify-center py-20">
          <StagedLoading stages={RESULTS_STAGES} size="lg" />
        </div>

        {/* Skeleton cards */}
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-cream-dark bg-white p-5 skeleton-card"
              style={{ animationDelay: `${i * 150}ms` }}
            >
              {/* Header skeleton */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-cream-dark skeleton-shimmer" />
                  <div className="h-5 w-36 rounded bg-cream-dark skeleton-shimmer" />
                </div>
                <div className="h-8 w-16 rounded bg-cream-dark skeleton-shimmer" />
              </div>

              {/* Reasoning skeleton */}
              <div className="mb-4 ml-9 space-y-2">
                <div className="h-3 w-full rounded bg-cream-dark skeleton-shimmer" />
                <div className="h-3 w-4/5 rounded bg-cream-dark skeleton-shimmer" />
              </div>

              {/* Factor bars skeleton */}
              <div className="ml-9 space-y-2">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="flex items-center gap-3">
                    <div className="h-3 w-20 rounded bg-cream-dark skeleton-shimmer" />
                    <div className="flex-1 h-2 rounded-full bg-cream-dark" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
