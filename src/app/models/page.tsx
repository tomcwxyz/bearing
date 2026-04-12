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

const tierColour: Record<string, string> = {
  frontier: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  mid: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  light: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

export default function ModelsPage() {
  const models = getAllModels()
  const providers = new Set(models.map((m) => m.provider))

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Model Registry
        </h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          {models.length} models across {providers.size} providers
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {models.map((model) => (
            <Link
              key={model.slug}
              href={`/models/${model.slug}`}
              className="group rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-100 dark:group-hover:text-zinc-300">
                    {model.name}
                  </h2>
                  <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                    {model.provider}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${tierColour[model.tier] ?? tierColour.light}`}
                >
                  {model.tier}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {model.capabilities.slice(0, 4).map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    {capabilityLabels[cap] ?? cap}
                  </span>
                ))}
                {model.capabilities.length > 4 && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
                    +{model.capabilities.length - 4}
                  </span>
                )}
              </div>

              <div className="mt-3 flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
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
