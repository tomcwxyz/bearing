'use client'

import { useState, useEffect } from 'react'
import { LoadingIndicator } from './loading-indicator'

interface Stage {
  label: string
  /** Seconds after mount to show this stage */
  after: number
}

interface StagedLoadingProps {
  stages: Stage[]
  size?: 'md' | 'lg'
}

/**
 * Shows a loading indicator with progressive status messages
 * that change as time passes — gives the user a sense of progress.
 */
export function StagedLoading({ stages, size = 'lg' }: StagedLoadingProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const current = [...stages].reverse().find((s) => elapsed >= s.after) ?? stages[0]

  return (
    <div className="flex flex-col items-center gap-6 fade-in">
      <LoadingIndicator size={size} />
      <div className="text-center">
        <p className="font-display text-navy text-base stage-text" key={current.label}>
          {current.label}
        </p>
        {elapsed > 3 && (
          <p className="mt-2 text-xs text-grey-blue fade-in">
            {elapsed}s elapsed
          </p>
        )}
      </div>
    </div>
  )
}
