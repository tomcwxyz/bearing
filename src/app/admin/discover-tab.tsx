'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import {
  syncPricing,
  estimateModelScores,
  importModel,
  suggestAliasesForImport,
  type SuggestionsBySource,
} from './actions'
import type { DiscoverModel } from './types'

type SourceKey = keyof SuggestionsBySource

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

const ALL_TASK_TYPES = [
  'summarise', 'generate', 'extract', 'code', 'analyse',
  'translate', 'conversation', 'vision',
] as const

interface DiscoverTabProps {
  initialModels: DiscoverModel[]
  matchedCount: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a slug from an OpenRouter ID, e.g. "anthropic/claude-opus-4.6" -> "claude-opus-4.6" */
function slugFromId(id: string): string {
  const parts = id.split('/')
  return parts.length > 1 ? parts.slice(1).join('/') : id
}

function emptyModelData(model: DiscoverModel) {
  return {
    slug: slugFromId(model.id),
    name: model.name,
    provider: model.provider,
    tier: 'balanced' as string,
    pricing: { ...model.pricing },
    context_window: model.contextWindow,
    capabilities: [...model.capabilities],
    strengths: [] as string[],
    weaknesses: [] as string[],
    task_fitness: Object.fromEntries(ALL_TASK_TYPES.map(t => [t, 0.5])) as Record<string, number>,
    speed_score: 0.5,
    privacy_score: 0.5,
    transparency: {
      open_weights: 0,
      open_training_data: 0,
      open_methodology: 0,
      licence_openness: 0,
      provider_disclosure: 0,
      fmti_company_score: null as number | null,
      transparency_score: 0,
      notes: '',
    },
    sustainability: {
      inference_energy: null as number | null,
      training_footprint: null as number | null,
      provider_infrastructure: null as number | null,
      sustainability_score: 0,
      notes: '',
    },
  }
}

type ModelFormData = ReturnType<typeof emptyModelData>

function formatPrice(price: number): string {
  if (price < 0.01) return `$${price.toFixed(4)}`
  return `$${price.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DiscoverTab({ initialModels, matchedCount }: DiscoverTabProps) {
  const [models] = useState(initialModels)
  const [search, setSearch] = useState('')
  const [syncBanner, setSyncBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSyncing, startSyncTransition] = useTransition()
  const [importingModel, setImportingModel] = useState<DiscoverModel | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return models
    const q = search.toLowerCase()
    return models.filter(
      m => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    )
  }, [models, search])

  function handleSync() {
    setSyncBanner(null)
    startSyncTransition(async () => {
      const result = await syncPricing()
      if (result.errors.length > 0) {
        setSyncBanner({ type: 'error', message: result.errors.join('; ') })
      } else {
        setSyncBanner({
          type: 'success',
          message: `Updated pricing for ${result.updated} models. ${result.unchanged} unchanged.`,
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Sync Pricing */}
      <section className="rounded-lg border border-cream-dark bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg text-navy">OpenRouter Sync</h2>
            <p className="text-sm text-navy/60">
              {matchedCount} models matched in registry &middot; {models.length} new models available
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {isSyncing ? 'Syncing...' : 'Sync Pricing'}
          </button>
        </div>
        {syncBanner && (
          <div className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            syncBanner.type === 'success'
              ? 'border-teal/30 bg-teal/5 text-teal'
              : 'border-coral/30 bg-coral/5 text-coral'
          }`}>
            {syncBanner.message}
          </div>
        )}
      </section>

      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or provider..."
          className="input-field w-full"
        />
      </div>

      {/* New Models Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-cream-dark bg-white p-8 text-center text-navy/50">
          {search.trim()
            ? 'No models match your search.'
            : 'All OpenRouter models are already in your registry.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-cream-dark">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-dark/60 text-left text-navy/70">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Modality</th>
                <th className="px-4 py-3 font-medium">Context</th>
                <th className="px-4 py-3 font-medium">Pricing (per 1M)</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-dark">
              {filtered.map((model) => (
                <tr key={model.id} className="bg-white hover:bg-cream/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-navy">{model.name}</div>
                    <div className="text-xs text-navy/50">{model.provider}</div>
                  </td>
                  <td className="px-4 py-3 text-navy/70">{model.modality}</td>
                  <td className="px-4 py-3 text-navy/70">{(model.contextWindow / 1000).toFixed(0)}k</td>
                  <td className="px-4 py-3 text-navy/70">
                    {formatPrice(model.pricing.input_per_1m)} / {formatPrice(model.pricing.output_per_1m)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setImportingModel(model)}
                      className="btn-secondary text-xs"
                    >
                      Import
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import Modal */}
      {importingModel && (
        <ImportModal
          model={importingModel}
          onClose={() => setImportingModel(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Import Modal
// ---------------------------------------------------------------------------

function ImportModal({ model, onClose }: { model: DiscoverModel; onClose: () => void }) {
  const [formData, setFormData] = useState<ModelFormData>(() => emptyModelData(model))
  const [isEstimating, startEstimateTransition] = useTransition()
  const [isSaving, startSaveTransition] = useTransition()
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const [hasEstimated, setHasEstimated] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Benchmark alias suggestions, fetched once on mount.
  const [suggestions, setSuggestions] = useState<SuggestionsBySource | null>(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [selectedAliases, setSelectedAliases] = useState<Set<string>>(new Set())  // key: `${source}::${name}`
  // Per-field provenance from the most recent estimate run.
  const [provenance, setProvenance] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    suggestAliasesForImport({ slug: formData.slug, name: formData.name, provider: formData.provider })
      .then(res => {
        if (cancelled) return
        setSuggestions(res)
        // Auto-select unflagged matches that aren't already aliased to a different bearing.
        const initial = new Set<string>()
        for (const source of Object.keys(res) as SourceKey[]) {
          for (const s of res[source]) {
            if (s.flags.length === 0 && !s.existingAlias) initial.add(`${source}::${s.name}`)
          }
        }
        setSelectedAliases(initial)
      })
      .catch(() => {
        if (!cancelled) setSuggestions({ lmarena: [], livebench: [], artificialanalysis: [] })
      })
      .finally(() => { if (!cancelled) setSuggestionsLoading(false) })
    return () => { cancelled = true }
    // Re-fetch only when the model identity changes — not on every slug edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id])

  function toggleAlias(source: SourceKey, name: string) {
    const key = `${source}::${name}`
    setSelectedAliases(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleEstimate() {
    setEstimateError(null)
    const aliasesPayload = [...selectedAliases].map(key => {
      const [source, ...rest] = key.split('::')
      return { source: source as SourceKey, sourceModelName: rest.join('::') }
    })
    startEstimateTransition(async () => {
      const result = await estimateModelScores(model, aliasesPayload)
      if (result.success && result.estimates) {
        setProvenance(result.provenance ?? {})
        const est = result.estimates as Record<string, unknown>
        const derived = est.derived_capabilities as { code?: boolean } | undefined
        setFormData(prev => {
          // Apply derived capability flags: add when true, remove when false.
          let nextCaps = prev.capabilities
          if (derived) {
            if (derived.code === true && !nextCaps.includes('code')) nextCaps = [...nextCaps, 'code']
            if (derived.code === false) nextCaps = nextCaps.filter(c => c !== 'code')
          }
          return {
            ...prev,
            capabilities: nextCaps,
            speed_score: typeof est.speed_score === 'number' ? est.speed_score : prev.speed_score,
            privacy_score: typeof est.privacy_score === 'number' ? est.privacy_score : prev.privacy_score,
            tier: typeof est.tier === 'string' ? est.tier : prev.tier,
            task_fitness: (est.task_fitness && typeof est.task_fitness === 'object')
              ? { ...prev.task_fitness, ...(est.task_fitness as Record<string, number>) }
              : prev.task_fitness,
            strengths: Array.isArray(est.strengths) ? est.strengths as string[] : prev.strengths,
            weaknesses: Array.isArray(est.weaknesses) ? est.weaknesses as string[] : prev.weaknesses,
            transparency: (est.transparency && typeof est.transparency === 'object')
              ? { ...prev.transparency, ...(est.transparency as Record<string, unknown>) } as ModelFormData['transparency']
              : prev.transparency,
            sustainability: (est.sustainability && typeof est.sustainability === 'object')
              ? { ...prev.sustainability, ...(est.sustainability as Record<string, unknown>) } as ModelFormData['sustainability']
              : prev.sustainability,
          }
        })
        setHasEstimated(true)
      } else {
        setEstimateError(result.error ?? 'Estimation failed')
      }
    })
  }

  function handleSave() {
    setFeedback(null)
    const fd = new FormData()
    fd.set('slug', formData.slug)
    fd.set('name', formData.name)
    fd.set('provider', formData.provider)
    fd.set('tier', formData.tier)
    fd.set('pricing', JSON.stringify(formData.pricing))
    fd.set('context_window', String(formData.context_window))
    fd.set('capabilities', JSON.stringify(formData.capabilities))
    fd.set('strengths', JSON.stringify(formData.strengths))
    fd.set('weaknesses', JSON.stringify(formData.weaknesses))
    fd.set('task_fitness', JSON.stringify(formData.task_fitness))
    fd.set('speed_score', String(formData.speed_score))
    fd.set('privacy_score', String(formData.privacy_score))
    fd.set('transparency', JSON.stringify(formData.transparency))
    fd.set('sustainability', JSON.stringify(formData.sustainability))
    fd.set('openrouter_id', model.id)

    const aliasesPayload = [...selectedAliases].map(key => {
      const [source, ...rest] = key.split('::')
      return { source: source as SourceKey, sourceModelName: rest.join('::') }
    })
    fd.set('selected_aliases', JSON.stringify(aliasesPayload))

    startSaveTransition(async () => {
      const result = await importModel(fd)
      if (result.success) {
        onClose()
      } else {
        setFeedback({ type: 'error', message: result.error ?? 'Import failed.' })
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="mx-4 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg border border-cream-dark bg-white p-6 shadow-xl">
        {/* Header: OpenRouter metadata */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-xl text-navy">{model.name}</h2>
              <p className="text-sm text-navy/60">{model.provider} &middot; {model.id}</p>
            </div>
            <button onClick={onClose} className="text-navy/40 hover:text-navy text-lg leading-none">&times;</button>
          </div>
          {model.description && (
            <p className="mt-2 text-sm text-navy/70 line-clamp-3">{model.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-navy/60">
            <span>Modality: {model.modality}</span>
            <span>Context: {(model.contextWindow / 1000).toFixed(0)}k</span>
            <span>Input: {formatPrice(model.pricing.input_per_1m)}/M</span>
            <span>Output: {formatPrice(model.pricing.output_per_1m)}/M</span>
          </div>
          {model.capabilities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {model.capabilities.map(cap => (
                <span key={cap} className="rounded-full border border-cream-dark px-2 py-0.5 text-xs text-navy/60">
                  {cap.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Benchmark alias matches */}
        <BenchmarkAliasPanel
          loading={suggestionsLoading}
          suggestions={suggestions}
          selected={selectedAliases}
          onToggle={toggleAlias}
        />

        {/* Warn when a flagship-priced model has no benchmark coverage —
            those are the cases where Haiku-only estimates do the most damage. */}
        {!suggestionsLoading && suggestions
          && model.pricing.output_per_1m >= 5
          && Object.values(suggestions).every(list => list.length === 0)
          && (
          <div className="mb-6 rounded-md border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">
            <strong>Warning:</strong> this model is priced as a flagship (${model.pricing.output_per_1m.toFixed(2)}/M output)
            but has no benchmark coverage in any source. Imported scores will rely entirely on Haiku
            estimates — consider waiting for LMArena / LiveBench / AA coverage before publishing.
          </div>
        )}

        {/* Generate Estimates */}
        {!hasEstimated && (
          <div className="mb-6 rounded-lg border border-cream-dark bg-cream/30 p-4 text-center">
            <button
              onClick={handleEstimate}
              disabled={isEstimating}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {isEstimating ? 'Estimating scores with Haiku...' : 'Generate Estimates'}
            </button>
            {estimateError && (
              <p className="mt-2 text-sm border rounded-md border-coral/30 bg-coral/5 text-coral px-3 py-2">
                {estimateError}
              </p>
            )}
          </div>
        )}

        {hasEstimated && Object.keys(provenance).length > 0 && (
          <div className="mb-4 rounded-md border border-teal/20 bg-teal/5 px-4 py-3 text-xs text-navy/70">
            <span className="font-medium text-teal">Grounded:</span>{' '}
            {Object.values(provenance).filter(p => p === 'benchmark').length} field(s) from benchmarks,{' '}
            {Object.values(provenance).filter(p => p === 'derived').length} derived,{' '}
            {Object.values(provenance).filter(p => p === 'haiku').length} from Haiku.
          </div>
        )}

        {feedback && (
          <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-teal/30 bg-teal/5 text-teal'
              : 'border-coral/30 bg-coral/5 text-coral'
          }`}>
            {feedback.message}
          </div>
        )}

        {/* Form */}
        <div className="space-y-6">
          {/* Basic Info */}
          <ModalSection title="Basic Info">
            <Field label="Slug" hint="Auto-generated from OpenRouter ID">
              <input
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="input-field"
              />
            </Field>
            <Field label="Name">
              <input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-field"
              />
            </Field>
            <Field label="Provider">
              <input
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                className="input-field"
              />
            </Field>
            <Field label="Tier">
              <select
                value={formData.tier}
                onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                className="input-field"
              >
                {ALL_TIERS.map(tier => (
                  <option key={tier} value={tier}>{tier.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </Field>
          </ModalSection>

          {/* Pricing */}
          <ModalSection title="Pricing (per 1M tokens)">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Input">
                <input
                  type="number"
                  step="0.01"
                  value={formData.pricing.input_per_1m}
                  onChange={(e) => setFormData({
                    ...formData,
                    pricing: { ...formData.pricing, input_per_1m: parseFloat(e.target.value) || 0 },
                  })}
                  className="input-field"
                />
              </Field>
              <Field label="Output">
                <input
                  type="number"
                  step="0.01"
                  value={formData.pricing.output_per_1m}
                  onChange={(e) => setFormData({
                    ...formData,
                    pricing: { ...formData.pricing, output_per_1m: parseFloat(e.target.value) || 0 },
                  })}
                  className="input-field"
                />
              </Field>
            </div>
          </ModalSection>

          {/* Performance */}
          <ModalSection title="Performance">
            <Field label="Context Window (tokens)">
              <input
                type="number"
                value={formData.context_window}
                onChange={(e) => setFormData({ ...formData, context_window: parseInt(e.target.value) || 0 })}
                className="input-field"
              />
            </Field>
            <ScoreSlider label="Speed Score" value={formData.speed_score} onChange={(v) => setFormData({ ...formData, speed_score: v })} provenance={provenance.speed_score} />
            <ScoreSlider label="Privacy Score" value={formData.privacy_score} onChange={(v) => setFormData({ ...formData, privacy_score: v })} provenance={provenance.privacy_score} />
          </ModalSection>

          {/* Capabilities */}
          <ModalSection title="Capabilities">
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map(cap => {
                const active = formData.capabilities.includes(cap)
                return (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? formData.capabilities.filter(c => c !== cap)
                        : [...formData.capabilities, cap]
                      setFormData({ ...formData, capabilities: next })
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
          </ModalSection>

          {/* Task Fitness */}
          <ModalSection title="Task Fitness">
            <div className="space-y-3">
              {ALL_TASK_TYPES.map(task => (
                <ScoreSlider
                  key={task}
                  label={task}
                  value={formData.task_fitness[task] ?? 0.5}
                  onChange={(v) =>
                    setFormData({ ...formData, task_fitness: { ...formData.task_fitness, [task]: v } })
                  }
                  provenance={provenance[`task_fitness.${task}`]}
                />
              ))}
            </div>
          </ModalSection>

          {/* Transparency */}
          <ModalSection title="Transparency">
            {(['open_weights', 'open_training_data', 'open_methodology', 'licence_openness', 'provider_disclosure', 'transparency_score'] as const).map(key => (
              <ScoreSlider
                key={key}
                label={key.replace(/_/g, ' ')}
                value={formData.transparency[key]}
                onChange={(v) => setFormData({
                  ...formData,
                  transparency: { ...formData.transparency, [key]: v },
                })}
                provenance={provenance[`transparency.${key}`]}
              />
            ))}
            <Field label="FMTI Company Score (optional)">
              <input
                type="number"
                step="0.01"
                value={formData.transparency.fmti_company_score ?? ''}
                onChange={(e) => setFormData({
                  ...formData,
                  transparency: {
                    ...formData.transparency,
                    fmti_company_score: e.target.value === '' ? null : parseFloat(e.target.value),
                  },
                })}
                className="input-field"
                placeholder="Leave blank if unknown"
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={formData.transparency.notes}
                onChange={(e) => setFormData({
                  ...formData,
                  transparency: { ...formData.transparency, notes: e.target.value },
                })}
                className="input-field"
                rows={2}
              />
            </Field>
          </ModalSection>

          {/* Sustainability */}
          <ModalSection title="Sustainability">
            <ScoreSlider
              label="sustainability score"
              value={formData.sustainability.sustainability_score}
              onChange={(v) => setFormData({
                ...formData,
                sustainability: { ...formData.sustainability, sustainability_score: v },
              })}
            />
            {(['inference_energy', 'training_footprint', 'provider_infrastructure'] as const).map(key => (
              <Field key={key} label={key.replace(/_/g, ' ') + ' (optional)'}>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sustainability[key] ?? ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    sustainability: {
                      ...formData.sustainability,
                      [key]: e.target.value === '' ? null : parseFloat(e.target.value),
                    },
                  })}
                  className="input-field"
                  placeholder="Leave blank if unknown"
                />
              </Field>
            ))}
            <Field label="Notes">
              <textarea
                value={formData.sustainability.notes}
                onChange={(e) => setFormData({
                  ...formData,
                  sustainability: { ...formData.sustainability, notes: e.target.value },
                })}
                className="input-field"
                rows={2}
              />
            </Field>
          </ModalSection>

          {/* Strengths */}
          <ModalSection title="Strengths">
            <EditableList
              items={formData.strengths}
              onChange={(items) => setFormData({ ...formData, strengths: items })}
            />
          </ModalSection>

          {/* Weaknesses */}
          <ModalSection title="Weaknesses">
            <EditableList
              items={formData.weaknesses}
              onChange={(items) => setFormData({ ...formData, weaknesses: items })}
            />
          </ModalSection>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3 border-t border-cream-dark pt-6">
          <button
            onClick={handleSave}
            disabled={isSaving || !formData.slug || !formData.name}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            onClick={onClose}
            className="btn-secondary text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared sub-components (local to this file, matching edit page patterns)
// ---------------------------------------------------------------------------

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-cream-dark bg-white p-5">
      <h3 className="font-display text-lg text-navy mb-4">{title}</h3>
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

// ---------------------------------------------------------------------------
// Benchmark alias suggestion panel
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<SourceKey, string> = {
  lmarena: 'LMArena',
  livebench: 'LiveBench',
  artificialanalysis: 'Artificial Analysis',
}

function BenchmarkAliasPanel({
  loading,
  suggestions,
  selected,
  onToggle,
}: {
  loading: boolean
  suggestions: SuggestionsBySource | null
  selected: Set<string>
  onToggle: (source: SourceKey, name: string) => void
}) {
  if (loading) {
    return (
      <div className="mb-6 rounded-lg border border-cream-dark bg-cream/30 p-4 text-sm text-navy/60">
        Looking up benchmark matches...
      </div>
    )
  }
  if (!suggestions) return null

  const total = (Object.values(suggestions) as Array<unknown[]>).reduce((n, list) => n + list.length, 0)
  const checkedCount = selected.size

  return (
    <section className="mb-6 rounded-lg border border-cream-dark bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h3 className="font-display text-lg text-navy">Benchmark matches</h3>
          <p className="text-xs text-navy/60">
            Confirm which external-source variants represent this model. Selected aliases are
            written when you save the import. Flagged candidates (mini, distill, vl, …) need a
            judgment call.
          </p>
        </div>
        <div className="text-xs text-navy/50">
          {checkedCount} selected / {total} candidate{total === 1 ? '' : 's'}
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded border border-dashed border-cream-dark bg-cream/40 px-4 py-6 text-center text-sm text-navy/50">
          No benchmark matches found for this model. It may not yet be covered by LMArena,
          LiveBench, or Artificial Analysis. You can still save the model — Haiku will fill all
          fields.
        </div>
      ) : (
        <div className="space-y-4">
          {(Object.keys(suggestions) as SourceKey[]).map(source => {
            const list = suggestions[source]
            if (list.length === 0) return null
            return (
              <div key={source}>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-navy/50">
                  {SOURCE_LABELS[source]}
                </div>
                <ul className="space-y-1.5">
                  {list.map(s => {
                    const key = `${source}::${s.name}`
                    const isChecked = selected.has(key)
                    const conflict = !!s.existingAlias
                    return (
                      <li key={key} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          id={key}
                          checked={isChecked}
                          onChange={() => onToggle(source, s.name)}
                          className="mt-1 accent-teal"
                        />
                        <label htmlFor={key} className="flex-1 cursor-pointer text-sm">
                          <span className="text-navy">{s.name}</span>
                          <span className="ml-2 font-mono text-xs text-navy/50">
                            {s.score.toFixed(2)}
                          </span>
                          {s.flags.length > 0 && (
                            <span className="ml-2 inline-flex flex-wrap gap-1">
                              {s.flags.map(f => (
                                <span
                                  key={f}
                                  className="rounded-full border border-amber-400/40 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700"
                                >
                                  {f}
                                </span>
                              ))}
                            </span>
                          )}
                          {conflict && (
                            <span className="ml-2 inline-block rounded-full border border-coral/30 bg-coral/5 px-2 py-0.5 text-[10px] font-medium text-coral">
                              already aliased to {s.existingAlias}
                            </span>
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
