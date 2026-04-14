'use client'

/**
 * Compass-themed loading indicator for Bearing.
 * Three sizes: sm (inline buttons), md (section loading), lg (full-page loading).
 */

interface LoadingIndicatorProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  sublabel?: string
}

export function LoadingIndicator({ size = 'md', label, sublabel }: LoadingIndicatorProps) {
  const dimensions = { sm: 20, md: 40, lg: 64 }
  const d = dimensions[size]
  const strokeWidth = size === 'sm' ? 2 : size === 'md' ? 2.5 : 3

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: d, height: d }}>
        {/* Outer ring — slow rotation */}
        <svg
          viewBox="0 0 48 48"
          fill="none"
          className="compass-ring absolute inset-0"
          style={{ width: d, height: d }}
        >
          <circle
            cx="24"
            cy="24"
            r="21"
            stroke="var(--color-cream-dark)"
            strokeWidth={strokeWidth}
          />
          <path
            d="M24 3a21 21 0 0 1 14.85 6.15"
            stroke="var(--color-teal)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <path
            d="M24 45a21 21 0 0 1-14.85-6.15"
            stroke="var(--color-teal)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity={0.4}
          />
        </svg>

        {/* Compass needle — oscillating rotation */}
        <svg
          viewBox="0 0 48 48"
          fill="none"
          className="compass-needle absolute inset-0"
          style={{ width: d, height: d }}
        >
          {/* North needle (teal) */}
          <path
            d="M24 10 L27 24 L24 22 L21 24 Z"
            fill="var(--color-teal)"
          />
          {/* South needle (coral, lighter) */}
          <path
            d="M24 38 L21 24 L24 26 L27 24 Z"
            fill="var(--color-coral)"
            opacity={0.5}
          />
          {/* Center dot */}
          <circle cx="24" cy="24" r="2" fill="var(--color-navy)" />
        </svg>
      </div>

      {label && (
        <p className={`font-display text-navy ${size === 'lg' ? 'text-base' : 'text-sm'}`}>
          {label}
        </p>
      )}
      {sublabel && (
        <p className="text-xs text-grey-blue">{sublabel}</p>
      )}
    </div>
  )
}

/**
 * Inline spinner for buttons — small, single-color, no label.
 */
export function ButtonSpinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />
  )
}
