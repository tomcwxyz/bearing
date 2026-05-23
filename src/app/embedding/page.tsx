'use client'

import { useState } from 'react'
import { submitEmbeddingTask, type EmbeddingFormInput } from '@/app/actions'
import { LoadingIndicator } from '@/components/loading-indicator'

// Each form group is a simple radio set so the user can answer with a
// single tap per field. Defaults are reasonable for a generic RAG build —
// retrieval / medium docs / no hosting preference / English / interactive.
const USE_CASE_OPTIONS: Array<{ value: EmbeddingFormInput['useCase']; label: string; hint: string }> = [
  { value: 'retrieval', label: 'Retrieval / RAG', hint: 'Find relevant docs for a query (most common)' },
  { value: 'similarity', label: 'Semantic similarity', hint: 'Score how similar two pieces of text are' },
  { value: 'classification', label: 'Classification', hint: 'Use embeddings as input features for a classifier' },
  { value: 'clustering', label: 'Clustering', hint: 'Group similar items without labels' },
  { value: 'dedup', label: 'Deduplication', hint: 'Find near-duplicate records at scale' },
  { value: 'other', label: 'Other / not sure', hint: 'Pick this and we will rank by general MTEB quality' },
]

const INPUT_OPTIONS: Array<{ value: EmbeddingFormInput['inputSize']; label: string; hint: string }> = [
  { value: 'short', label: 'Short', hint: 'Queries, sentences, social posts' },
  { value: 'medium', label: 'Medium', hint: 'Paragraphs, FAQ entries, abstracts' },
  { value: 'long', label: 'Long', hint: 'Full documents, contracts, chapters' },
]

const HOSTING_OPTIONS: Array<{ value: EmbeddingFormInput['hosting']; label: string; hint: string }> = [
  { value: 'no_preference', label: 'No preference', hint: 'Hosted APIs and open models both eligible' },
  { value: 'hosted', label: 'Prefer hosted API', hint: 'Lowest operational burden' },
  { value: 'open', label: 'Prefer open / self-hosted', hint: 'Full control + no data egress' },
]

const LANGUAGE_OPTIONS: Array<{ value: EmbeddingFormInput['languages']; label: string; hint: string }> = [
  { value: 'english', label: 'English only', hint: 'English-optimised models score higher on MTEB-Eng' },
  { value: 'few', label: 'English plus a few others', hint: 'European + a handful of other languages' },
  { value: 'many', label: 'Many languages', hint: '20+ languages — surfaces multilingual specialists' },
]

const LATENCY_OPTIONS: Array<{ value: EmbeddingFormInput['latency']; label: string; hint: string }> = [
  { value: 'any', label: 'Batch — latency doesn’t matter', hint: 'Run overnight to build / refresh an index' },
  { value: 'interactive', label: 'Interactive', hint: 'Embed a user query at request time' },
  { value: 'realtime', label: 'Realtime', hint: 'Sub-100 ms per query, hot paths' },
]

function Field<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string
  name: string
  options: Array<{ value: T; label: string; hint: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="mb-6">
      <legend className="mb-2 block font-display text-sm font-medium text-navy">{legend}</legend>
      <div className="space-y-2">
        {options.map(opt => (
          <label
            key={opt.value}
            className={`block cursor-pointer rounded-lg border px-4 py-3 transition-colors ${
              value === opt.value
                ? 'border-teal bg-teal/5'
                : 'border-cream-dark bg-white hover:border-teal/40'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-sm font-medium text-navy">{opt.label}</span>
              {value === opt.value && (
                <span className="text-xs font-mono text-teal">selected</span>
              )}
            </div>
            <p className="mt-1 text-xs text-grey-blue">{opt.hint}</p>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function EmbeddingPage() {
  const [form, setForm] = useState<EmbeddingFormInput>({
    useCase: 'retrieval',
    inputSize: 'medium',
    hosting: 'no_preference',
    languages: 'english',
    latency: 'interactive',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      const result = await submitEmbeddingTask(form)
      if (result?.error) {
        setError(result.error)
        setLoading(false)
      }
      // Success path is a server-side redirect — control never returns here.
    } catch {
      // redirect() throws — Next handles it.
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-16 sm:py-20">
      <div className="w-full max-w-2xl">
        <h1 className="mb-3 font-display text-4xl text-navy">Find an embedding model</h1>
        <p className="mb-10 text-lg text-grey-blue">
          Vector models for retrieval, RAG, similarity, clustering, and deduplication.
          Bearing ranks against MTEB, pricing, multilingual coverage, and self-hosting
          options.
        </p>

        <div className="relative rounded-xl border border-cream-dark bg-cream/30 p-6">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/90 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <LoadingIndicator size="lg" />
                <p className="font-display text-sm text-navy">Ranking embedding models...</p>
              </div>
            </div>
          )}

          <Field
            legend="What's it for?"
            name="useCase"
            options={USE_CASE_OPTIONS}
            value={form.useCase}
            onChange={v => setForm(f => ({ ...f, useCase: v }))}
          />
          <Field
            legend="How long are the texts you'll embed?"
            name="inputSize"
            options={INPUT_OPTIONS}
            value={form.inputSize}
            onChange={v => setForm(f => ({ ...f, inputSize: v }))}
          />
          <Field
            legend="Hosting preference"
            name="hosting"
            options={HOSTING_OPTIONS}
            value={form.hosting}
            onChange={v => setForm(f => ({ ...f, hosting: v }))}
          />
          <Field
            legend="Languages"
            name="languages"
            options={LANGUAGE_OPTIONS}
            value={form.languages}
            onChange={v => setForm(f => ({ ...f, languages: v }))}
          />
          <Field
            legend="Latency"
            name="latency"
            options={LATENCY_OPTIONS}
            value={form.latency}
            onChange={v => setForm(f => ({ ...f, latency: v }))}
          />

          {error && (
            <p role="alert" className="mb-4 text-sm text-coral">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-lg bg-navy px-4 py-3 font-display text-sm font-semibold text-cream transition-colors hover:bg-navy-light disabled:opacity-50"
          >
            {loading ? 'Ranking embedding models...' : 'Show me embedding models'}
          </button>
        </div>
      </div>
    </div>
  )
}
