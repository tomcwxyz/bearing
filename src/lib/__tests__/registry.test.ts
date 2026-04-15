import { describe, it, expect } from 'vitest'
import { getRegistry, getModel, getAllModels, getModelSlugs } from '../registry'

describe('registry', () => {
  it('loads the registry with metadata', () => {
    const registry = getRegistry()
    expect(registry.meta.name).toBe('Bearing Model Registry')
    expect(registry.meta.version).toBe('0.5.0')
  })

  it('returns a model by slug', () => {
    const model = getModel('claude-sonnet-4.6')
    expect(model).toBeDefined()
    expect(model!.name).toBe('Claude Sonnet 4.6')
    expect(model!.provider).toBe('Anthropic')
  })

  it('returns undefined for unknown slug', () => {
    const model = getModel('nonexistent-model')
    expect(model).toBeUndefined()
  })

  it('returns all models as an array', () => {
    const models = getAllModels()
    expect(models.length).toBe(29)
    expect(models[0]).toHaveProperty('slug')
    expect(models[0]).toHaveProperty('name')
  })

  it('returns all model slugs', () => {
    const slugs = getModelSlugs()
    expect(slugs).toContain('claude-sonnet-4.6')
    expect(slugs).toContain('ibm-granite-3.3')
    expect(slugs).toContain('mistral-ocr')
    expect(slugs.length).toBe(29)
  })
})
