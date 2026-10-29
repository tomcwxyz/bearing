import { describe, expect, it } from 'vitest'
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
