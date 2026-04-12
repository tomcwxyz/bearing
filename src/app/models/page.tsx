'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { getAllModels } from '@/lib/registry'
import type { Capability } from '@/lib/registry'

const capabilityLabels: Record<Capability, string> = {
  vision: 'Vision',
  tools: 'Tools',
  code: 'Code',
  long_context: 'Long Context',
  extended_thinking: 'Extended Thinking',
  structured_output: 'Structured Output',
  multilingual: 'Multilingual',
  audio: 'Audio',
  video: 'Video',
  computer_use: 'Computer Use',
}

function tierColour(tier: string): string {
  if (tier === 'flagship') return 'bg-coral/10 text-coral'
  if (tier === 'balanced') return 'bg-teal/10 text-teal'
  if (tier === 'budget') return 'bg-amber/10 text-amber'
  if (tier === 'reasoning') return 'bg-navy/10 text-navy'
  if (tier.startsWith('open_source')) return 'bg-teal/10 text-teal'
  if (tier.startsWith('sustainable')) return 'bg-teal/10 text-teal'
  if (tier.startsWith('enterprise')) return 'bg-navy/10 text-navy'
  if (tier.startsWith('specialist')) return 'bg-amber/10 text-amber'
  return 'bg-teal/10 text-teal'
}

function tierLabel(tier: string): string {
  return tier.replace(/_/g, ' ')
}

const CAPABILITY_FILTERS: { value: Capability; label: string }[] = [
  { value: 'vision', label: 'Vision' },
  { value: 'code', label: 'Code' },
  { value: 'tools', label: 'Tools' },
  { value: 'long_context', label: 'Long context' },
  { value: 'extended_thinking', label: 'Reasoning' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
]

export default function ModelsPage() {
  const allModels = getAllModels()
  const providers = useMemo(() => [...new Set(allModels.map((m) => m.provider))].sort(), [allModels])

  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState<string | null>(null)
  const [capabilityFilter, setCapabilityFilter] = useState<Capability | null>(null)

  const filtered = useMemo(() => {
    let models = allModels

    if (search.trim()) {
      const q = search.toLowerCase()
      models = models.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q) ||
          m.slug.toLowerCase().includes(q)
      )
    }

    if (providerFilter) {
      models = models.filter((m) => m.provider === providerFilter)
    }

    if (capabilityFilter) {
      models = models.filter((m) => m.capabilities.includes(capabilityFilter))
    }

    return models
  }, [allModels, search, providerFilter, capabilityFilter])

  const hasFilters = search.trim() || providerFilter || capabilityFilter

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <h1 className="font-display text-4xl text-navy">Model Registry</h1>
        <p className="mt-2 text-navy/60">
          {allModels.length} models across {providers.length} providers
        </p>

        {/* Search */}
        <div className="mt-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models, providers..."
            className="w-full rounded-lg border border-cream-dark bg-white px-4 py-2.5 text-sm text-navy placeholder-grey-blue-light focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
        </div>

        {/* Filter pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Provider filters */}
          {providers.map((provider) => (
            <button
              key={provider}
              onClick={() =>
                setProviderFilter(providerFilter === provider ? null : provider)
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                providerFilter === provider
                  ? 'border-navy bg-navy text-cream'
                  : 'border-cream-dark text-navy/70 hover:border-teal hover:text-teal'
              }`}
            >
              {provider}
            </button>
          ))}

          {/* Divider */}
          <span className="mx-1 self-center text-cream-dark">|</span>

          {/* Capability filters */}
          {CAPABILITY_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() =>
                setCapabilityFilter(capabilityFilter === value ? null : value)
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                capabilityFilter === value
                  ? 'border-teal bg-teal text-cream'
                  : 'border-cream-dark text-navy/70 hover:border-teal hover:text-teal'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Active filter indicator */}
        {hasFilters && (
          <div className="mt-3 flex items-center gap-2">
            <p className="text-sm text-navy/60">
              {filtered.length} model{filtered.length !== 1 ? 's' : ''} found
            </p>
            <button
              onClick={() => {
                setSearch('')
                setProviderFilter(null)
                setCapabilityFilter(null)
              }}
              className="text-xs text-teal hover:text-teal-light"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Model grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((model) => (
            <Link
              key={model.slug}
              href={`/models/${model.slug}`}
              className="group rounded-xl border border-cream-dark bg-white p-5 shadow-sm transition-all hover:border-teal hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-navy">
                    {model.name}
                  </h2>
                  <p className="mt-0.5 text-sm text-navy/60">{model.provider}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs ${tierColour(model.tier)}`}
                >
                  {tierLabel(model.tier)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {model.capabilities.slice(0, 4).map((cap) => (
                  <span
                    key={cap}
                    className="rounded bg-cream-dark px-2 py-0.5 font-mono text-xs text-navy"
                  >
                    {capabilityLabels[cap] ?? cap}
                  </span>
                ))}
                {model.capabilities.length > 4 && (
                  <span className="rounded bg-cream-dark px-2 py-0.5 font-mono text-xs text-navy">
                    +{model.capabilities.length - 4}
                  </span>
                )}
              </div>

              <div className="mt-3 flex gap-4 font-mono text-sm text-navy/60">
                <span>${model.pricing.input_per_1m}/1M in</span>
                <span>${model.pricing.output_per_1m}/1M out</span>
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="mt-12 text-center">
            <p className="text-navy/60">No models match your filters.</p>
            <button
              onClick={() => {
                setSearch('')
                setProviderFilter(null)
                setCapabilityFilter(null)
              }}
              className="mt-2 text-sm text-teal hover:text-teal-light"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
