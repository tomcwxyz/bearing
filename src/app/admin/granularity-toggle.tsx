'use client'

// TODO: import from @/lib/dashboard once that module exists
type Granularity = 'day' | 'week' | 'month'

const OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

export default function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity
  onChange: (g: Granularity) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-cream-dark p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-navy text-cream'
              : 'text-navy/60 hover:text-navy'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
