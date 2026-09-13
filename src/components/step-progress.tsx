'use client'

const STEPS = [
  { key: 'describe', label: 'Describe' },
  { key: 'clarify', label: 'Clarify' },
  { key: 'prioritize', label: 'Adjust' },
  { key: 'results', label: 'Results' },
] as const

export type StepKey = (typeof STEPS)[number]['key']

interface StepProgressProps {
  current: StepKey
  /** Hide the clarify step when classification was confident enough to skip it. */
  hideClarify?: boolean
  /** Hide manual priority adjustment when Bearing inferred priorities automatically. */
  hidePrioritize?: boolean
}

export function StepProgress({
  current,
  hideClarify = false,
  hidePrioritize = false,
}: StepProgressProps) {
  const steps = STEPS.filter((step) => {
    if (hideClarify && step.key === 'clarify') return false
    if (hidePrioritize && step.key === 'prioritize') return false
    return true
  })
  const currentIndex = steps.findIndex((s) => s.key === current)

  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center justify-center gap-0">
        {steps.map((step, index) => {
          const isComplete = index < currentIndex
          const isCurrent = index === currentIndex
          const isLast = index === steps.length - 1

          return (
            <li key={step.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold font-mono transition-all duration-300 ${
                    isComplete
                      ? 'border-teal bg-teal text-white'
                      : isCurrent
                        ? 'border-teal bg-teal/10 text-teal step-pulse'
                        : 'border-cream-dark bg-white text-grey-blue'
                  }`}
                >
                  {isComplete ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`mt-1.5 text-xs font-medium transition-colors duration-300 ${
                    isComplete || isCurrent ? 'text-navy' : 'text-grey-blue'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {!isLast && (
                <div className="mx-2 mb-5 h-0.5 w-8 sm:w-12">
                  <div
                    className={`h-full rounded-full transition-colors duration-500 ${
                      isComplete ? 'bg-teal' : 'bg-cream-dark'
                    }`}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
