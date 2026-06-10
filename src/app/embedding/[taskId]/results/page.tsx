import Link from 'next/link'
import { getEmbeddingResults } from '@/app/actions'
import { getAllModels } from '@/lib/registry'
import { embeddingPriceLabel } from '@/lib/pricing'
import type { ScoredModel } from '@/lib/scoring'

// Embedding pricing is input-only — providers bill per 1M input tokens with
// no output cost. We surface that headline number directly rather than
// "cost per task" (which depends on chat-style assumptions about output
// length that don't apply here).
function pricingPer1M(slug: string): number | null {
  const m = getAllModels().find(x => x.slug === slug)
  return m ? m.pricing.input_per_1m : null
}

function modelMeta(slug: string): {
  embeddingDim: number | null
  maxInputTokens: number | null
  supportsMatryoshka: boolean
  capabilities: string[]
} {
  const m = getAllModels().find(x => x.slug === slug)
  return {
    embeddingDim: m?.embedding_dim ?? null,
    maxInputTokens: m?.max_input_tokens ?? null,
    supportsMatryoshka: m?.supports_matryoshka ?? false,
    capabilities: m?.capabilities ?? [],
  }
}

function ModelCard({ model, rank }: { model: ScoredModel; rank: number }) {
  const matchPercent = Math.min(100, Math.round(model.weightedScore * 100))
  const pricing = pricingPer1M(model.slug)
  const meta = modelMeta(model.slug)

  return (
    <div className="rounded-xl border border-cream-dark bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-lg font-bold ${
                rank === 1 ? 'bg-teal text-white' : 'bg-cream-dark text-navy'
              }`}
            >
              {rank}
            </span>
            <h3 className="font-display text-xl font-bold text-navy">
              <Link href={`/models/${model.slug}`} className="hover:text-teal">
                {model.name}
              </Link>
            </h3>
          </div>
          <p className="mt-0.5 ml-9 text-grey-blue text-sm">{model.provider}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-3xl font-bold text-navy">{matchPercent}%</p>
          <p className="text-grey-blue text-xs">match</p>
        </div>
      </div>

      {/* Embedding-specific metadata grid */}
      <div className="ml-9 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {meta.embeddingDim != null && (
          <div>
            <span className="text-grey-blue text-xs">Embedding dim</span>
            <p className="font-mono text-navy">
              {meta.embeddingDim}
              {meta.supportsMatryoshka && (
                <span className="ml-1 text-xs text-teal">(Matryoshka)</span>
              )}
            </p>
          </div>
        )}
        {meta.maxInputTokens != null && (
          <div>
            <span className="text-grey-blue text-xs">Max input</span>
            <p className="font-mono text-navy">{meta.maxInputTokens.toLocaleString()} tokens</p>
          </div>
        )}
        <div>
          <span className="text-grey-blue text-xs">Price</span>
          <p className="font-mono text-navy">
            {pricing != null ? embeddingPriceLabel(pricing, ' / 1M tokens') : '—'}
          </p>
        </div>
        {meta.capabilities.length > 0 && (
          <div>
            <span className="text-grey-blue text-xs">Capabilities</span>
            <p className="text-navy text-xs">{meta.capabilities.join(', ')}</p>
          </div>
        )}
      </div>

      {model.strengths.length > 0 && (
        <div className="ml-9 mt-3 border-t border-cream-dark pt-3">
          <ul className="space-y-0.5 text-sm text-navy/80">
            {model.strengths.slice(0, 3).map(s => (
              <li key={s} className="before:mr-1.5 before:content-['•'] before:text-teal">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default async function EmbeddingResultsPage({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = await params
  const result = await getEmbeddingResults(taskId)

  if ('error' in result && result.error) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-2 font-display text-navy">Something went wrong</h2>
          <p className="text-grey-blue">{result.error}</p>
        </div>
      </main>
    )
  }

  const { task, models } = result as { task: { task_type: string; task_subtype: string | null }; models: ScoredModel[] }

  if (!models || models.length === 0) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-2 font-display text-navy">No embedding models match</h2>
          <p className="text-grey-blue">Try relaxing the hosting or latency constraints.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-2 font-display text-navy">Embedding models for your task</h2>
        <p className="text-grey-blue mb-8">
          Ranked for <strong>{task.task_subtype ?? 'general embedding'}</strong>. MTEB
          quality, pricing per 1M input tokens, max input length, and Matryoshka
          support shown per model.
        </p>

        <div className="space-y-4">
          {models.map((m, i) => (
            <ModelCard key={m.slug} model={m} rank={i + 1} />
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-teal/20 bg-teal/5 px-4 py-3 text-sm text-navy/80">
          Embedding models are stateless — there is no "selected model + outcome"
          feedback loop the way there is for chat. Pick from the ranking, integrate,
          and re-run if you want to compare under different priorities.
        </div>

        <div className="mt-6">
          <Link
            href="/embedding"
            className="font-display text-sm text-teal underline underline-offset-2 hover:text-teal-light"
          >
            ← Try a different brief
          </Link>
        </div>
      </div>
    </main>
  )
}
