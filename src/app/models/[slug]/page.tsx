import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getModel, getAllModels } from '@/lib/registry'
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
  if (tier === 'frontier') return 'bg-coral/10 text-coral'
  if (tier === 'mid') return 'bg-teal/10 text-teal'
  if (tier === 'light') return 'bg-amber/10 text-amber'
  return 'bg-teal/10 text-teal'
}

const taskLabels: Record<string, string> = {
  summarise: 'Summarise',
  generate: 'Generate',
  extract: 'Extract',
  code: 'Code',
  analyse: 'Analyse',
  translate: 'Translate',
  conversation: 'Conversation',
  vision: 'Vision',
  other: 'Other',
}

export function generateStaticParams() {
  return getAllModels().map((m) => ({ slug: m.slug }))
}

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const model = getModel(slug)
  if (!model) notFound()

  const t = model.transparency
  const s = model.sustainability

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-3xl">
        <Link
          href="/models"
          className="mb-6 inline-flex items-center gap-1 text-sm text-teal hover:text-teal-light"
        >
          &larr; All models
        </Link>

        {/* Header */}
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl text-navy">
              {model.name}
            </h1>
            <p className="mt-1 text-grey-blue text-lg">{model.provider}</p>
          </div>
          <span
            className={`shrink-0 font-mono text-xs px-2 py-0.5 rounded-full ${tierColour(model.tier)}`}
          >
            {model.tier}
          </span>
        </div>

        {/* Capabilities */}
        <Section title="Capabilities">
          <div className="flex flex-wrap gap-2">
            {model.capabilities.map((cap) => (
              <span
                key={cap}
                className="bg-navy text-cream font-mono text-sm px-3 py-1 rounded-full"
              >
                {capabilityLabels[cap] ?? cap}
              </span>
            ))}
          </div>
        </Section>

        {/* Strengths & Weaknesses */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Section title="Strengths">
            <ul className="list-inside list-disc space-y-1 text-sm text-navy marker:text-grey-blue">
              {model.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Section>
          <Section title="Weaknesses">
            <ul className="list-inside list-disc space-y-1 text-sm text-navy marker:text-grey-blue">
              {model.weaknesses.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Section>
        </div>

        {/* Pricing */}
        <Section title="Pricing">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Stat label="Input / 1M tokens" value={`$${model.pricing.input_per_1m}`} />
            <Stat label="Output / 1M tokens" value={`$${model.pricing.output_per_1m}`} />
            <Stat
              label="Context window"
              value={`${(model.context_window / 1000).toLocaleString()}k`}
            />
          </div>
        </Section>

        {/* Transparency */}
        <Section title="Transparency">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Stat label="Open weights" value={formatScore(t.open_weights)} />
            <Stat label="Open training data" value={formatScore(t.open_training_data)} />
            <Stat label="Open methodology" value={formatScore(t.open_methodology)} />
            <Stat label="Licence openness" value={formatScore(t.licence_openness)} />
            <Stat label="Provider disclosure" value={formatScore(t.provider_disclosure)} />
            <Stat
              label="FMTI company score"
              value={t.fmti_company_score !== null ? formatScore(t.fmti_company_score) : 'N/A'}
            />
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="font-medium text-navy">Composite:</span>
            <span className="font-mono font-bold text-teal text-xl">
              {formatScore(t.transparency_score)}
            </span>
          </div>
          {t.notes && (
            <p className="mt-2 text-grey-blue italic text-sm">{t.notes}</p>
          )}
        </Section>

        {/* Sustainability */}
        <Section title="Sustainability">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Stat
              label="Inference energy"
              value={s.inference_energy !== null ? formatScore(s.inference_energy) : 'N/A'}
            />
            <Stat
              label="Training footprint"
              value={s.training_footprint !== null ? formatScore(s.training_footprint) : 'N/A'}
            />
            <Stat
              label="Provider infrastructure"
              value={
                s.provider_infrastructure !== null
                  ? formatScore(s.provider_infrastructure)
                  : 'N/A'
              }
            />
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="font-medium text-navy">Composite:</span>
            <span className="font-mono font-bold text-teal text-xl">
              {formatScore(s.sustainability_score)}
            </span>
          </div>
          {s.notes && (
            <p className="mt-2 text-grey-blue italic text-sm">{s.notes}</p>
          )}
        </Section>

        {/* Task Fitness */}
        <Section title="Task Fitness">
          <div className="space-y-3">
            {Object.entries(model.task_fitness).map(([task, score]) => (
              <div key={task} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-grey-blue">
                  {taskLabels[task] ?? task}
                </span>
                <div className="relative h-2.5 flex-1 rounded-full bg-cream-dark">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-teal"
                    style={{ width: `${score * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right font-mono text-xs tabular-nums text-grey-blue">
                  {(score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <h2 className="mb-3 font-display text-lg text-navy uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-grey-blue">{label}</p>
      <p className="font-mono text-xl text-navy">{value}</p>
    </div>
  )
}

function formatScore(score: number): string {
  return (score * 10).toFixed(1) + ' / 10'
}
