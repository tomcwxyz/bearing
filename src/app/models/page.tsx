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
  // fallback for legacy tiers
  if (tier === 'frontier') return 'bg-coral/10 text-coral'
  if (tier === 'mid') return 'bg-teal/10 text-teal'
  if (tier === 'light') return 'bg-amber/10 text-amber'
  return 'bg-teal/10 text-teal'
}

export default function ModelsPage() {
  const models = getAllModels()
  const providers = new Set(models.map((m) => m.provider))

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <h1 className="font-display text-4xl text-navy">
          Model Registry
        </h1>
        <p className="mt-2 text-grey-blue">
          {models.length} models across {providers.size} providers
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {models.map((model) => (
            <Link
              key={model.slug}
              href={`/models/${model.slug}`}
              className="group bg-white border border-cream-dark rounded-xl shadow-sm hover:border-teal hover:shadow-md transition-all p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-navy">
                    {model.name}
                  </h2>
                  <p className="mt-0.5 text-grey-blue text-sm">
                    {model.provider}
                  </p>
                </div>
                <span
                  className={`shrink-0 font-mono text-xs px-2 py-0.5 rounded-full ${tierColour(model.tier)}`}
                >
                  {model.tier}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {model.capabilities.slice(0, 4).map((cap) => (
                  <span
                    key={cap}
                    className="font-mono text-xs bg-cream-dark text-navy px-2 py-0.5 rounded"
                  >
                    {capabilityLabels[cap] ?? cap}
                  </span>
                ))}
                {model.capabilities.length > 4 && (
                  <span className="font-mono text-xs bg-cream-dark text-navy px-2 py-0.5 rounded">
                    +{model.capabilities.length - 4}
                  </span>
                )}
              </div>

              <div className="mt-3 flex gap-4 font-mono text-sm text-grey-blue">
                <span>${model.pricing.input_per_1m}/1M in</span>
                <span>${model.pricing.output_per_1m}/1M out</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
