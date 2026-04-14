'use client'

import type { LocalInferenceResult, LocalModelRecommendation, HardwareTier } from '@/lib/local-inference'

interface LocalSectionProps {
  local: LocalInferenceResult
}

function formatParams(rec: LocalModelRecommendation): string {
  const { localInfo } = rec
  const total = `${localInfo.total_params_b}B`
  if (localInfo.is_moe && localInfo.active_params_b) {
    return `${total} MoE, ${localInfo.active_params_b}B active`
  }
  return total
}

function TierGroup({
  tier,
  recommendations,
}: {
  tier: HardwareTier
  recommendations: LocalModelRecommendation[]
}) {
  return (
    <div className="rounded-lg border border-cream-dark bg-white p-4">
      <div className="mb-3">
        <p className="font-display text-sm font-semibold text-navy">
          {tier.name}
        </p>
        <p className="text-navy/50 text-xs">
          {tier.examples.join(' · ')}
        </p>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec) => {
          const matchPct = Math.round(rec.effectiveQuality * 100)
          return (
            <div key={rec.model.slug} className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-navy">
                  {rec.model.name}{' '}
                  <span className="text-navy/50 font-normal">
                    ({formatParams(rec)})
                  </span>
                </p>
                <p className="text-xs text-navy/60 mt-0.5">
                  {rec.model.strengths[0]}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs text-navy/70">
                  {rec.bestQuant.quant} · ~{rec.bestQuant.vram_gb} GB
                </p>
                <p className="font-mono text-sm font-semibold text-navy">
                  {matchPct}% <span className="text-navy/50 font-normal text-xs">match</span>
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function LocalSection({ local }: LocalSectionProps) {
  const { recommendations, tiersUsed } = local
  if (recommendations.length === 0) return null

  // Group recommendations by tier
  const byTier = new Map<string, LocalModelRecommendation[]>()
  for (const rec of recommendations) {
    const id = rec.hardwareTier.id
    if (!byTier.has(id)) byTier.set(id, [])
    byTier.get(id)!.push(rec)
  }

  return (
    <div className="mt-8 rounded-xl border-2 border-navy/20 bg-navy/5 p-6">
      <h2 className="font-display text-xl text-navy">Run it locally</h2>
      <p className="mt-1 text-navy/70 text-sm leading-relaxed">
        These open-weight models can run on your own hardware.
        Your data never leaves your machine.
      </p>

      <div className="mt-4 space-y-3">
        {tiersUsed.map((tier) => {
          const recs = byTier.get(tier.id)
          if (!recs) return null
          return <TierGroup key={tier.id} tier={tier} recommendations={recs} />
        })}
      </div>

      <p className="mt-4 text-xs text-navy/50">
        Run with: Ollama · LM Studio · llama.cpp
      </p>
    </div>
  )
}
