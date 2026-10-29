import { describe, expect, it, vi } from 'vitest'
import { getModel, type Factor, type Model } from '@/lib/registry'
import { scoreModelsDetailed } from '@/lib/scoring'
import { scorePipeline } from '@/lib/pipeline'

const priorityOrder: Factor[] = ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']
const input = {
  taskType: 'other',
  complexity: 'moderate',
  inputLength: 'medium',
  needsVision: false,
  needsTools: false,
  needsCode: false,
  priorityOrder,
}

const live = getModel('claude-sonnet-4.6') as Model

describe('scoring respects the live catalogue', () => {
  it('scores only the supplied live models, never a retired model in the bundled registry', () => {
    const ranked = scoreModelsDetailed(input, [live])
    expect(ranked.models.map(item => item.slug)).toEqual([live.slug])
    expect(ranked.excluded).toEqual([])
  })

  it('does not fall back to bundled models for an empty live catalogue', () => {
    expect(scoreModelsDetailed(input, [])).toEqual({ models: [], excluded: [] })
  })

  it('requires an explicitly supplied catalogue in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() => scoreModelsDetailed(input)).toThrow('Live model catalogue is required')
      expect(scoreModelsDetailed(input, [live]).models.map(model => model.slug)).toEqual([live.slug])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('carries model details from the supplied catalogue rather than from the static snapshot', () => {
    const edited = {
      ...live,
      name: 'Renamed in Neon',
      pricing: { input_per_1m: 4.75, output_per_1m: 15 },
      task_fitness: { ...live.task_fitness, other: 0.92 },
    }
    const scored = scoreModelsDetailed(input, [edited]).models[0]
    expect(scored.name).toBe('Renamed in Neon')
    expect(scored.inputPricePer1M).toBe(4.75)
    expect(scored.curatedTaskFitness).toBe(0.92)
  })

  it('uses the same live list for every pipeline stage', () => {
    const result = scorePipeline({
      models: [live],
      inputLength: 'short',
      priorityOrder,
      stages: [
        { stage: 1, task_type: 'summarise', description: 'Summarise', requires_capabilities: [] },
        { stage: 2, task_type: 'generate', description: 'Draft', requires_capabilities: [] },
      ],
    })
    expect(result.stages.map(stage => stage.recommended.slug)).toEqual([live.slug, live.slug])
  })
})
