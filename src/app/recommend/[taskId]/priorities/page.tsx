'use client'

import { useState, useRef, useTransition } from 'react'
import { useParams } from 'next/navigation'
import { submitPriorities } from '@/app/actions'
import { StepProgress } from '@/components/step-progress'
import { LoadingIndicator } from '@/components/loading-indicator'
import type { Factor } from '@/lib/registry'

const FACTOR_INFO: { factor: Factor; label: string; description: string }[] = [
  { factor: 'quality', label: 'Quality', description: 'Best possible output for your task' },
  { factor: 'capability', label: 'Capability', description: 'Specific features like vision, code, long context' },
  { factor: 'cost', label: 'Cost', description: 'Keeping spend low' },
  { factor: 'transparency', label: 'Transparency', description: 'Open weights, training data, methodology' },
  { factor: 'privacy', label: 'Privacy', description: 'Data handling and retention policies' },
  { factor: 'sustainability', label: 'Sustainability', description: 'Energy use and environmental footprint' },
  { factor: 'speed', label: 'Speed', description: 'Fast responses' },
]

export default function PrioritiesPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const [items, setItems] = useState(FACTOR_INFO)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)

  function handleDragStart(index: number) {
    dragItem.current = index
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    dragOverItem.current = index
  }

  function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null) return
    if (dragItem.current === dragOverItem.current) {
      dragItem.current = null
      dragOverItem.current = null
      return
    }

    const updated = [...items]
    const [dragged] = updated.splice(dragItem.current, 1)
    updated.splice(dragOverItem.current, 0, dragged)
    setItems(updated)

    dragItem.current = null
    dragOverItem.current = null
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= items.length) return
    const updated = [...items]
    ;[updated[index], updated[target]] = [updated[target], updated[index]]
    setItems(updated)
  }

  function handleSubmit() {
    setError(null)
    const priorityOrder = items.map((item) => item.factor)
    startTransition(async () => {
      try {
        const result = await submitPriorities(taskId, priorityOrder)
        if (result?.error) {
          setError(result.error)
        }
      } catch {
        // redirect() throws — let Next.js handle it
      }
    })
  }

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col items-center px-4 py-12">
        <div className="w-full max-w-xl">
          <StepProgress current="results" hideClarify />
          <div className="flex flex-col items-center justify-center py-16 fade-in">
            <LoadingIndicator size="lg" label="Crunching the numbers..." sublabel="Scoring models against your priorities" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12">
      <div className="w-full max-w-xl fade-in">
        <StepProgress current="prioritize" hideClarify />

        <h1 className="mb-3 text-center font-display text-3xl font-bold tracking-tight text-navy">
          What matters to you?
        </h1>
        <p className="mb-10 text-center text-grey-blue">
          Drag to reorder. The top factor matters most.
        </p>

        <ul className="mb-8 space-y-2">
          {items.map((item, index) => (
            <li
              key={item.factor}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className="flex items-center gap-3 rounded-lg border border-cream-dark bg-white px-4 py-3 select-none transition-colors hover:border-teal active:border-teal active:bg-teal/5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal/10 font-mono text-xs font-bold text-teal">
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold text-navy">
                  {item.label}
                </p>
                <p className="truncate text-xs text-grey-blue">
                  {item.description}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveItem(index, 'up')}
                  disabled={index === 0}
                  aria-label={`Move ${item.label} up`}
                  className="rounded px-1.5 py-0.5 text-xs text-grey-blue transition-colors hover:bg-teal/10 hover:text-teal disabled:opacity-30"
                >
                  &#9650;
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(index, 'down')}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${item.label} down`}
                  className="rounded px-1.5 py-0.5 text-xs text-grey-blue transition-colors hover:bg-teal/10 hover:text-teal disabled:opacity-30"
                >
                  &#9660;
                </button>
              </div>

              <span className="cursor-grab text-grey-blue" aria-hidden="true">
                &#8942;&#8942;
              </span>
            </li>
          ))}
        </ul>

        {error && (
          <p className="mb-4 text-sm text-coral">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          className="w-full rounded-lg bg-navy px-4 py-3 font-display text-sm font-semibold text-cream transition-colors hover:bg-navy-light"
        >
          Show me results
        </button>
      </div>
    </div>
  )
}
