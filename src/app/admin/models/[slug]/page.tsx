'use client'

import { useState, useEffect, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getModelAdmin, saveModelAdmin, regroundModel } from '@/app/admin/actions'
import { ALL_TASK_TYPES, withSustainabilityComposite } from '@/lib/registry'

const ALL_CAPABILITIES = [
  'vision', 'tools', 'code', 'long_context', 'extended_thinking',
  'structured_output', 'multilingual', 'audio', 'video', 'computer_use',
] as const

const ALL_TIERS = [
  'flagship', 'balanced', 'budget', 'reasoning',
  'open_source_flagship', 'open_source_balanced',
  'sustainable_balanced', 'sustainable_flagship',
  'enterprise_transparent', 'specialist_vision', 'specialist_code',
] as const

function emptyModel() {
  return {
    slug: '',
    name: '',
    provider: '',
    tier: 'balanced',
    pricing: { input_per_1m: 0, output_per_1m: 0 },
    context_window: 128000,
    capabilities: [] as string[],
    strengths: [] as string[],
    weaknesses: [] as string[],
    task_fitness: Object.fromEntries(ALL_TASK_TYPES.map(t => [t, 0.5])) as Record<string, number>,
    speed_score: 0.5,
    privacy_score: 0.5,
    transparency: {
      open_weights: 0, open_training_data: 0, open_methodology: 0,
      licence_openness: 0, provider_disclosure: 0,
      fmti_company_score: null as number | null,
      transparency_score: 0, notes: '',
    },
    sustainability: {
      inference_energy: null as number | null,
      training_footprint: null as number | null,
      provider_infrastructure: null as number | null,
      sustainability_score: 0, notes: '',
    },
    active: true,
  }
}

type ModelData = ReturnType<typeof emptyModel>

export default function AdminModelEditPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const isNew = slug === 'new'

  const [model, setModel] = useState<ModelData>(emptyModel())
  const [loading, setLoading] = useState(!isNew)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isRegrounding, startRegroundTransition] = useTransition()
  const [provenance, setProvenance] = useState<Record<string, string>>({})

  function handleReground() {
    setFeedback(null)
    startRegroundTransition(async () => {
      const result = await regroundModel(slug)
      if (!result.success || !result.grounded) {
        setFeedback({ type: 'error', message: result.error ?? 'Reground failed.' })
        return
      }
      const g = result.grounded
      setProvenance(result.provenance ?? {})
      setModel(prev => {
        let nextCaps = prev.capabilities
        if (g.derived_capabilities.code === true && !nextCaps.includes('code')) nextCaps = [...nextCaps, 'code']
        if (g.derived_capabilities.code === false) nextCaps = nextCaps.filter(c => c !== 'code')
        const newModel = {
          ...prev,
          capabilities: nextCaps,
          task_fitness: { ...prev.task_fitness, ...g.task_fitness },
          speed_score: g.speed_score ?? prev.speed_score,
          privacy_score: g.privacy_score,
          transparency: {
            ...prev.transparency,
            open_weights: g.transparency.open_weights,
            transparency_score: g.transparency.transparency_score,
          },
        }
        if (g.inference_energy !== null) {
          // Recompute the composite so it reflects the regrounded inference_energy.
          newModel.sustainability = withSustainabilityComposite({
            ...newModel.sustainability,
            inference_energy: g.inference_energy,
          })
        }
        return newModel
      })
      const groundedCount = Object.values(result.provenance ?? {}).filter(p => p === 'benchmark').length
      setFeedback({
        type: 'success',
        message: `Refreshed from benchmarks: ${groundedCount} field(s) grounded. Save to persist.`,
      })
    })
  }

  useEffect(() => {
    if (!isNew) {
      getModelAdmin(slug).then((data) => {
        if (data) {
          setModel({
            ...data,
            transparency: {
              ...data.transparency,
              fmti_company_score: data.transparency.fmti_company_score,
            },
            sustainability: {
              inference_energy: data.sustainability.inference_energy,
              training_footprint: data.sustainability.training_footprint,
              provider_infrastructure: data.sustainability.provider_infrastructure,
              sustainability_score: data.sustainability.sustainability_score,
              notes: data.sustainability.notes,
            },
            active: data.active,
          })
        }
        setLoading(false)
      })
    }
  }, [slug, isNew])

  function handleSave() {
    setFeedback(null)
    const formData = new FormData()
    formData.set('slug', model.slug)
    formData.set('name', model.name)
    formData.set('provider', model.provider)
    formData.set('tier', model.tier)
    formData.set('pricing', JSON.stringify(model.pricing))
    formData.set('context_window', String(model.context_window))
    formData.set('capabilities', JSON.stringify(model.capabilities))
    formData.set('strengths', JSON.stringify(model.strengths))
    formData.set('weaknesses', JSON.stringify(model.weaknesses))
    formData.set('task_fitness', JSON.stringify(model.task_fitness))
    formData.set('speed_score', String(model.speed_score))
    formData.set('privacy_score', String(model.privacy_score))
    formData.set('transparency', JSON.stringify(model.transparency))
    formData.set('sustainability', JSON.stringify(model.sustainability))
    formData.set('active', String(model.active))

    startTransition(async () => {
      const result = await saveModelAdmin(formData)
      if (result.success) {
        setFeedback({ type: 'success', message: 'Model saved.' })
        if (isNew) router.push(`/admin/models/${model.slug}`)
      } else {
        setFeedback({ type: 'error', message: result.error ?? 'Save failed.' })
      }
    })
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <p className="text-navy/60">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-3xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl text-navy">
            {isNew ? 'Add Model' : `Edit: ${model.name}`}
          </h1>
          <div className="flex items-center gap-3">
            {!isNew && (
              <button
                onClick={handleReground}
                disabled={isRegrounding}
                className="text-sm text-teal hover:text-teal-light disabled:opacity-50"
                title="Recompute grounded fields from benchmark snapshots and the provider profile"
              >
                {isRegrounding ? 'Refreshing...' : 'Refresh from benchmarks'}
              </button>
            )}
            <button onClick={() => router.push('/admin')} className="text-sm text-teal hover:text-teal-light">
              Back to list
            </button>
          </div>
        </div>

        {feedback && (
          <div className={`rounded-md border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-teal/30 bg-teal/5 text-teal'
              : 'border-coral/30 bg-coral/5 text-coral'
          }`}>
            {feedback.message}
          </div>
        )}

        {/* Basic Info */}
        <Section title="Basic Info">
          <Field label="Slug" hint={isNew ? 'URL-safe identifier, e.g. claude-sonnet-4.6' : 'Cannot be changed after creation'}>
            <input
              value={model.slug}
              onChange={(e) => setModel({ ...model, slug: e.target.value })}
              disabled={!isNew}
              className="input-field"
            />
          </Field>
          <Field label="Name">
            <input
              value={model.name}
              onChange={(e) => setModel({ ...model, name: e.target.value })}
              className="input-field"
            />
          </Field>
          <Field label="Provider">
            <input
              value={model.provider}
              onChange={(e) => setModel({ ...model, provider: e.target.value })}
              className="input-field"
            />
          </Field>
          <Field label="Tier">
            <select
              value={model.tier}
              onChange={(e) => setModel({ ...model, tier: e.target.value })}
              className="input-field"
            >
              {ALL_TIERS.map((tier) => (
                <option key={tier} value={tier}>{tier.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </Field>
          <Field label="Status" hint={model.active ? 'Published — visible in recommendations' : 'Draft — hidden from recommendations'}>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={model.active}
                onChange={(e) => setModel({ ...model, active: e.target.checked })}
                className="h-4 w-4 accent-teal"
              />
              <span className="text-sm text-navy/80">Active</span>
            </label>
          </Field>
        </Section>

        {/* Pricing */}
        <Section title="Pricing (per 1M tokens)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Input">
              <input
                type="number"
                step="0.01"
                value={model.pricing.input_per_1m}
                onChange={(e) => setModel({
                  ...model,
                  pricing: { ...model.pricing, input_per_1m: parseFloat(e.target.value) || 0 },
                })}
                className="input-field"
              />
            </Field>
            <Field label="Output">
              <input
                type="number"
                step="0.01"
                value={model.pricing.output_per_1m}
                onChange={(e) => setModel({
                  ...model,
                  pricing: { ...model.pricing, output_per_1m: parseFloat(e.target.value) || 0 },
                })}
                className="input-field"
              />
            </Field>
          </div>
        </Section>

        {/* Performance */}
        <Section title="Performance">
          <Field label="Context Window (tokens)">
            <input
              type="number"
              value={model.context_window}
              onChange={(e) => setModel({ ...model, context_window: parseInt(e.target.value) || 0 })}
              className="input-field"
            />
          </Field>
          <ScoreSlider label="Speed Score" value={model.speed_score} onChange={(v) => setModel({ ...model, speed_score: v })} provenance={provenance.speed_score} />
          <ScoreSlider label="Privacy Score" value={model.privacy_score} onChange={(v) => setModel({ ...model, privacy_score: v })} provenance={provenance.privacy_score} />
        </Section>

        {/* Capabilities */}
        <Section title="Capabilities">
          <div className="flex flex-wrap gap-2">
            {ALL_CAPABILITIES.map((cap) => {
              const active = model.capabilities.includes(cap)
              return (
                <button
                  key={cap}
                  type="button"
                  onClick={() => {
                    const next = active
                      ? model.capabilities.filter((c) => c !== cap)
                      : [...model.capabilities, cap]
                    setModel({ ...model, capabilities: next })
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-teal bg-teal text-cream'
                      : 'border-cream-dark text-navy/70 hover:border-teal hover:text-teal'
                  }`}
                >
                  {cap.replace(/_/g, ' ')}
                </button>
              )
            })}
          </div>
        </Section>

        {/* Task Fitness */}
        <Section title="Task Fitness">
          <div className="space-y-3">
            {ALL_TASK_TYPES.map((task) => (
              <ScoreSlider
                key={task}
                label={task}
                value={model.task_fitness[task] ?? 0.5}
                onChange={(v) =>
                  setModel({ ...model, task_fitness: { ...model.task_fitness, [task]: v } })
                }
                provenance={provenance[`task_fitness.${task}`]}
              />
            ))}
          </div>
        </Section>

        {/* Transparency */}
        <Section title="Transparency">
          {(['open_weights', 'open_training_data', 'open_methodology', 'licence_openness', 'provider_disclosure', 'transparency_score'] as const).map((key) => (
            <ScoreSlider
              key={key}
              label={key.replace(/_/g, ' ')}
              value={model.transparency[key]}
              onChange={(v) => setModel({
                ...model,
                transparency: { ...model.transparency, [key]: v },
              })}
              provenance={provenance[`transparency.${key}`]}
            />
          ))}
          <Field label="FMTI Company Score (optional)">
            <input
              type="number"
              step="0.01"
              value={model.transparency.fmti_company_score ?? ''}
              onChange={(e) => setModel({
                ...model,
                transparency: {
                  ...model.transparency,
                  fmti_company_score: e.target.value === '' ? null : parseFloat(e.target.value),
                },
              })}
              className="input-field"
              placeholder="Leave blank if unknown"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={model.transparency.notes}
              onChange={(e) => setModel({
                ...model,
                transparency: { ...model.transparency, notes: e.target.value },
              })}
              className="input-field"
              rows={2}
            />
          </Field>
        </Section>

        {/* Sustainability */}
        <Section title="Sustainability">
          {(['sustainability_score'] as const).map((key) => (
            <ScoreSlider
              key={key}
              label={key.replace(/_/g, ' ')}
              value={model.sustainability[key]}
              onChange={(v) => setModel({
                ...model,
                sustainability: { ...model.sustainability, [key]: v },
              })}
            />
          ))}
          <Field label="inference energy (optional)">
            <div className="flex items-center gap-2">
              <ProvenanceDot provenance={provenance['sustainability.inference_energy']} />
              <input
                type="number"
                step="0.01"
                value={model.sustainability.inference_energy ?? ''}
                onChange={(e) => setModel({ ...model, sustainability: withSustainabilityComposite({ ...model.sustainability, inference_energy: e.target.value === '' ? null : parseFloat(e.target.value) }) })}
                className="input-field flex-1"
                placeholder="Leave blank if unknown"
              />
            </div>
          </Field>
          {(['training_footprint', 'provider_infrastructure'] as const).map((key) => (
            <Field key={key} label={key.replace(/_/g, ' ') + ' (optional)'}>
              <input
                type="number"
                step="0.01"
                value={model.sustainability[key] ?? ''}
                onChange={(e) => setModel({
                  ...model,
                  sustainability: withSustainabilityComposite({
                    ...model.sustainability,
                    [key]: e.target.value === '' ? null : parseFloat(e.target.value),
                  }),
                })}
                className="input-field"
                placeholder="Leave blank if unknown"
              />
            </Field>
          ))}
          <Field label="Notes">
            <textarea
              value={model.sustainability.notes}
              onChange={(e) => setModel({
                ...model,
                sustainability: { ...model.sustainability, notes: e.target.value },
              })}
              className="input-field"
              rows={2}
            />
          </Field>
        </Section>

        {/* Strengths / Weaknesses */}
        <Section title="Strengths">
          <EditableList
            items={model.strengths}
            onChange={(items) => setModel({ ...model, strengths: items })}
          />
        </Section>

        <Section title="Weaknesses">
          <EditableList
            items={model.weaknesses}
            onChange={(items) => setModel({ ...model, weaknesses: items })}
          />
        </Section>

        {/* Save */}
        <div className="flex gap-3 border-t border-cream-dark pt-6">
          <button
            onClick={handleSave}
            disabled={isPending || !model.slug || !model.name}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save Model'}
          </button>
          <button
            onClick={() => router.push('/admin')}
            className="btn-secondary text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// -- Sub-components --

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-cream-dark bg-white p-5">
      <h2 className="font-display text-lg text-navy mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-navy">
        {label}
        {hint && <span className="ml-2 font-normal text-navy/50">{hint}</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function ScoreSlider({
  label, value, onChange, provenance,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  provenance?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex w-40 shrink-0 items-center gap-1.5 text-sm text-navy/80">
        <ProvenanceDot provenance={provenance} />
        {label}
      </label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-teal"
      />
      <span className="w-12 text-right font-mono text-xs text-navy/60">{value.toFixed(2)}</span>
    </div>
  )
}

function ProvenanceDot({ provenance }: { provenance?: string }) {
  if (!provenance) return <span className="inline-block w-2" aria-hidden />
  const map: Record<string, { bg: string; title: string }> = {
    benchmark: { bg: 'bg-teal', title: 'From benchmark snapshot (LMArena / LiveBench / AA)' },
    derived:   { bg: 'bg-amber-400', title: 'Derived deterministically (provider table or rule)' },
    haiku:     { bg: 'bg-navy/30', title: 'Estimated by Haiku' },
    default:   { bg: 'bg-navy/20', title: 'Default — provider not in lookup table' },
    ecologits: { bg: 'bg-teal', title: 'Grounded by EcoLogits (inference energy measurement)' },
  }
  const entry = map[provenance] ?? map.default
  return (
    <span
      title={entry.title}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${entry.bg}`}
      aria-label={`provenance: ${provenance}`}
    />
  )
}

function EditableList({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState('')

  function add() {
    const trimmed = draft.trim()
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed])
      setDraft('')
    }
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex-1 rounded border border-cream-dark bg-cream px-3 py-1.5 text-sm text-navy">
            {item}
          </span>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="text-coral/70 hover:text-coral text-sm"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="Add item..."
          className="input-field flex-1"
        />
        <button type="button" onClick={add} className="text-sm text-teal hover:text-teal-light">
          Add
        </button>
      </div>
    </div>
  )
}
