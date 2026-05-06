'use client'

import type { ScoredModel } from '@/lib/scoring'

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
        {stages.map((stage, index) => (
          <div key={stage.stage}>
            {/* Stage card */}
            <div className="rounded-lg border border-cream-dark border-l-4 border-l-teal bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal text-white font-mono text-sm font-bold">
                  {stage.stage}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold text-navy">
                    {stage.description}
                  </p>
                  <p className="mt-1 text-navy/70 text-sm">
                    {stage.recommended.name}
                    <span className="text-navy/50 ml-1">({stage.recommended.provider})</span>
                    <span className="font-mono text-navy/60 ml-2">
                      ~${stage.recommended.estimatedCost.toFixed(4)} per stage
                    </span>
                  </p>
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
        ))}
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
