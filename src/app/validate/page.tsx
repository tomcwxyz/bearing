'use client'

import { useState, useRef, useTransition } from 'react'
import { submitValidation } from '@/app/actions'
import registryData from '@/data/bearing-registry.json'

interface ModelOption {
  slug: string
  name: string
  provider: string
}

const MODEL_OPTIONS: ModelOption[] = Object.entries(registryData.models).map(
  ([slug, model]) => ({
    slug,
    name: (model as { name: string }).name,
    provider: (model as { provider: string }).provider,
  }),
)

export default function ValidatePage() {
  const [query, setQuery] = useState('')
  const [selectedSlug, setSelectedSlug] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim()
    ? MODEL_OPTIONS.filter(
        (m) =>
          m.name.toLowerCase().includes(query.toLowerCase()) ||
          m.slug.toLowerCase().includes(query.toLowerCase()) ||
          m.provider.toLowerCase().includes(query.toLowerCase()),
      )
    : MODEL_OPTIONS

  function handleSelect(option: ModelOption) {
    setQuery(option.name)
    setSelectedSlug(option.slug)
    setShowDropdown(false)
  }

  function handleInputChange(value: string) {
    setQuery(value)
    setSelectedSlug('')
    setShowDropdown(true)
  }

  function handleSubmit(formData: FormData) {
    if (!selectedSlug) {
      setError('Please select a model from the list.')
      return
    }
    setError(null)
    formData.set('modelSlug', selectedSlug)
    startTransition(async () => {
      try {
        const result = await submitValidation(formData)
        if (result?.error) {
          setError(result.error)
        }
      } catch {
        // redirect() throws — let Next.js handle it
      }
    })
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-20">
      <div className="w-full max-w-xl">
        <h1 className="mb-3 text-center font-display text-3xl font-bold tracking-tight text-navy">
          Validate your model
        </h1>
        <p className="mb-10 text-center text-grey-blue">
          Find out if your current model is the best fit
        </p>

        <form action={handleSubmit}>
          {/* Model selector */}
          <label
            htmlFor="model-input"
            className="mb-2 block font-display text-sm font-medium text-navy"
          >
            Which model are you using?
          </label>
          <div className="relative mb-4">
            <input
              ref={inputRef}
              id="model-input"
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => {
                // Delay to allow click on dropdown item
                setTimeout(() => setShowDropdown(false), 150)
              }}
              placeholder="e.g. Claude Sonnet, GPT-4o, Gemini..."
              autoComplete="off"
              className="w-full rounded-lg border border-cream-dark bg-white px-4 py-3 text-sm text-navy placeholder-grey-blue-light focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              disabled={isPending}
            />
            {showDropdown && filtered.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-cream-dark bg-white shadow-lg">
                {filtered.map((option) => (
                  <li key={option.slug}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleSelect(option)
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-cream"
                    >
                      <span className="font-display font-semibold text-navy">
                        {option.name}
                      </span>
                      <span className="text-grey-blue text-xs">
                        {option.provider}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {showDropdown && query.trim() && filtered.length === 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-cream-dark bg-white px-4 py-3 text-sm text-grey-blue shadow-lg">
                No matching models found
              </div>
            )}
          </div>

          {/* Hidden field for the slug */}
          <input type="hidden" name="modelSlug" value={selectedSlug} />

          {/* Task description */}
          <label
            htmlFor="description"
            className="mb-2 block font-display text-sm font-medium text-navy"
          >
            What do you use this model for?
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            placeholder="e.g. Generating marketing copy for social media campaigns"
            className="mb-4 w-full resize-y rounded-lg border border-cream-dark bg-white px-4 py-3 text-sm text-navy placeholder-grey-blue-light focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            disabled={isPending}
          />

          {error && (
            <p className="mb-4 text-sm text-coral">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-navy px-4 py-3 font-display text-sm font-semibold text-cream transition-colors hover:bg-navy-light disabled:opacity-50"
          >
            {isPending ? (
              <span className="text-teal-light">Checking...</span>
            ) : (
              'Check my model'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
