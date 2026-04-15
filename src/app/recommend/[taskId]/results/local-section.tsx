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
  return `${total} params`
}

function TierGroup({
  tier,
  recommendations,
}: {
  tier: HardwareTier
  recommendations: LocalModelRecommendation[]
}) {
  return (
    <div className="rounded-lg border border-cream-dark border-l-4 border-l-amber bg-white p-4">
      <div className="mb-3">
        <p className="font-display text-sm font-semibold text-navy">
          {tier.name}
        </p>
        <p className="text-navy/40 text-xs">
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
                  {rec.model.name}
                  <span className="text-navy/40 font-normal text-xs ml-1">
                    {formatParams(rec)}
                  </span>
                </p>
                <p className="text-xs text-navy/50 mt-0.5">
                  {rec.model.strengths[0]}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs text-navy/50">
                  {rec.bestQuant.quant} · ~{rec.bestQuant.vram_gb} GB
                </p>
                <p className="font-mono text-sm font-bold text-navy">
                  {matchPct}%
                  <span className="text-navy/40 font-normal text-xs ml-0.5">match</span>
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const TOOLS = [
  { name: 'Ollama', url: 'https://ollama.com' },
  { name: 'LM Studio', url: 'https://lmstudio.ai' },
  { name: 'llama.cpp', url: 'https://github.com/ggerganov/llama.cpp' },
]

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
    <div className="mt-8 rounded-xl border-2 border-amber/30 bg-amber/5 p-6">
      <div className="flex items-start gap-3 mb-1">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber text-white text-base">
          ⌂
        </span>
        <div>
          <h2 className="font-display text-xl font-bold text-navy">Run it locally</h2>
          <p className="mt-0.5 text-navy/60 text-sm leading-relaxed">
            These open-weight models can run on your own hardware — your data never leaves your machine.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {tiersUsed.map((tier) => {
          const recs = byTier.get(tier.id)
          if (!recs) return null
          return <TierGroup key={tier.id} tier={tier} recommendations={recs} />
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-amber/20 flex items-center gap-1.5 text-xs text-navy/50">
        <span>Run with:</span>
        {TOOLS.map((tool, i) => (
          <span key={tool.name}>
            {i > 0 && <span className="mr-1.5">·</span>}
            <a
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-navy/70 underline decoration-navy/20 underline-offset-2 hover:text-navy hover:decoration-navy/40 transition-colors"
            >
              {tool.name}
            </a>
          </span>
        ))}
      </div>
    </div>
  )
}
