'use client'

import { getAllModels } from '@/lib/registry'
import type { ScoredModel } from '@/lib/scoring'

// Lookup table built once at module load: slug → embedding-specific metadata.
// pipeline-section is a client component and getAllModels reads the bundled
// JSON, so this is a static read with no network cost.
const EMBEDDING_META: Record<string, { dim: number | null; maxIn: number | null; matryoshka: boolean; openWeights: boolean; pricePer1M: number }> = (() => {
  const out: Record<string, { dim: number | null; maxIn: number | null; matryoshka: boolean; openWeights: boolean; pricePer1M: number }> = {}
  for (const m of getAllModels()) {
    if (m.model_class !== 'embedding') continue
    out[m.slug] = {
      dim: m.embedding_dim ?? null,
      maxIn: m.max_input_tokens ?? null,
      matryoshka: m.supports_matryoshka ?? false,
      openWeights: m.pricing.input_per_1m === 0,
      pricePer1M: m.pricing.input_per_1m,
    }
  }
  return out
})()

interface PipelineStage {
  stage: number
  description: string
  taskType: string
  recommended: ScoredModel
  alternative: ScoredModel | null
  capabilityMissing?: boolean
}

interface PipelineSectionProps {
  pipeline: {
    stages: PipelineStage[]
    totalEstimatedCost: number
    reasoning: string
  }
  singleModelCost: number
}

export function PipelineSection({ pipeline, singleModelCost }: PipelineSectionProps) {
  const { stages, totalEstimatedCost, reasoning } = pipeline
  const savingsPercent = singleModelCost > 0
    ? Math.round(((singleModelCost - totalEstimatedCost) / singleModelCost) * 100)
    : 0
  const isCheaper = totalEstimatedCost < singleModelCost

  return (
    <div className="mt-8 rounded-xl border-2 border-teal/30 bg-teal/5 p-6">
      <h2 className="font-display text-xl text-navy">Pipeline alternative</h2>

      <p className="mt-2 text-navy/70 italic text-sm leading-relaxed">
        {reasoning}
      </p>

      <div className="mt-4 space-y-0">
        {stages.map((stage, index) => {
          // Embedding stages get a distinct surface: the per-stage cost number
          // is computed assuming chat-style output tokens, which makes no sense
          // for a vector job. Surface input-only $/1M tokens, dim, and max
          // input instead — the axes that actually drive an embedding choice.
          const embedMeta = stage.taskType === 'embedding'
            ? EMBEDDING_META[stage.recommended.slug]
            : undefined

          return (
            <div key={stage.stage}>
              {/* Stage card */}
              <div className="rounded-lg border border-cream-dark border-l-4 border-l-teal bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal text-white font-mono text-sm font-bold">
                    {stage.stage}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-display text-sm font-semibold text-navy">
                        {stage.description}
                      </p>
                      {embedMeta && (
                        <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal">
                          embedding
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-navy/70 text-sm">
                      {stage.recommended.name}
                      <span className="text-navy/50 ml-1">({stage.recommended.provider})</span>
                      {embedMeta ? (
                        <span className="font-mono text-navy/60 ml-2">
                          {embedMeta.openWeights
                            ? 'Free (self-host)'
                            : `$${embedMeta.pricePer1M.toFixed(2)} / 1M tokens`}
                        </span>
                      ) : (
                        <span className="font-mono text-navy/60 ml-2">
                          ~${stage.recommended.estimatedCost.toFixed(4)} per stage
                        </span>
                      )}
                    </p>
                    {embedMeta && (
                      <p className="mt-1 font-mono text-navy/55 text-xs">
                        {embedMeta.dim != null && (
                          <>dim {embedMeta.dim}{embedMeta.matryoshka && ' (Matryoshka)'}</>
                        )}
                        {embedMeta.dim != null && embedMeta.maxIn != null && ' · '}
                        {embedMeta.maxIn != null && (
                          <>max {embedMeta.maxIn.toLocaleString()} tokens in</>
                        )}
                      </p>
                    )}
                    {stage.alternative && (
                      <p className="mt-0.5 text-navy/50 text-xs">
                        or {stage.alternative.name}
                      </p>
                    )}
                    {stage.capabilityMissing && (
                      <p className="mt-1 text-amber-700 text-xs">
                        No model in the registry advertises every required capability for this
                        stage. The recommendation above is a best-effort fallback — verify it
                        handles {stage.taskType} inputs as needed.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Arrow connector between stages */}
              {index < stages.length - 1 && (
                <div className="text-center text-teal text-xl my-2">↓</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Cost comparison footer */}
      <div className="mt-4 pt-4 border-t border-cream-dark font-mono text-sm text-navy/70">
        Pipeline: ${totalEstimatedCost.toFixed(4)} vs Single model: ${singleModelCost.toFixed(4)}
        {isCheaper && (
          <span className="text-teal font-semibold ml-2">
            ({savingsPercent}% savings)
          </span>
        )}
      </div>
    </div>
  )
}
