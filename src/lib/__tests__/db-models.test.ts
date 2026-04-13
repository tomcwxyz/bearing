import { describe, it, expect } from 'vitest'
import { modelRowToModel } from '../db'

describe('modelRowToModel', () => {
  it('converts a DB row to a Model object with slug', () => {
    const row = {
      slug: 'test-model',
      name: 'Test Model',
      provider: 'TestCo',
      tier: 'balanced',
      pricing: { input_per_1m: 1.0, output_per_1m: 2.0 },
      context_window: 128000,
      capabilities: ['vision', 'code'],
      strengths: ['Fast'],
      weaknesses: ['Expensive'],
      task_fitness: { code: 0.9, generate: 0.7 },
      speed_score: 0.8,
      privacy_score: 0.6,
      transparency: {
        open_weights: 0, open_training_data: 0, open_methodology: 0.5,
        licence_openness: 0.3, provider_disclosure: 0.7,
        fmti_company_score: null, transparency_score: 0.3, notes: ''
      },
      sustainability: {
        inference_energy: 0.5, training_footprint: null,
        provider_infrastructure: 0.6, sustainability_score: 0.55, notes: ''
      },
      active: true,
      created_at: '2026-04-13',
      updated_at: '2026-04-13',
    }
    const model = modelRowToModel(row)
    expect(model.slug).toBe('test-model')
    expect(model.name).toBe('Test Model')
    expect(model.pricing.input_per_1m).toBe(1.0)
    expect(model.capabilities).toEqual(['vision', 'code'])
  })
})
