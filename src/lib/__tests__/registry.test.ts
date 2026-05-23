import { describe, it, expect } from 'vitest'
import { getRegistry, getModel, getAllModels, getModelSlugs, ALL_TASK_TYPES, TASK_TYPE_LABELS } from '../registry'

describe('registry', () => {
  it('loads the registry with metadata', () => {
    const registry = getRegistry()
    expect(registry.meta.name).toBe('Bearing Model Registry')
    expect(registry.meta.version).toBe('0.9.0')
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
    expect(models.length).toBe(41)
    expect(models[0]).toHaveProperty('slug')
    expect(models[0]).toHaveProperty('name')
  })

  it('returns all model slugs', () => {
    const slugs = getModelSlugs()
    expect(slugs).toContain('claude-sonnet-4.6')
    expect(slugs).toContain('ibm-granite-3.3')
    expect(slugs).toContain('mistral-ocr')
    expect(slugs.length).toBe(41)
  })

  it('exposes thirteen canonical task types including embedding', () => {
    expect(ALL_TASK_TYPES.length).toBe(13)
    expect(ALL_TASK_TYPES).toContain('embedding')
    expect(ALL_TASK_TYPES).not.toContain('vision')
    expect(ALL_TASK_TYPES).not.toContain('other')
    // every task type has a UI label
    for (const t of ALL_TASK_TYPES) {
      expect(TASK_TYPE_LABELS[t]).toBeTruthy()
    }
  })

  it('partitions models into 31 chat + 10 embedding', () => {
    const all = getAllModels()
    const chat = all.filter(m => m.model_class === 'chat')
    const embedding = all.filter(m => m.model_class === 'embedding')
    expect(chat.length).toBe(31)
    expect(embedding.length).toBe(10)
  })

  it('every model carries all 13 task_fitness keys', () => {
    const all = getAllModels()
    for (const m of all) {
      for (const t of ALL_TASK_TYPES) {
        expect(
          m.task_fitness[t],
          `${m.slug} missing task_fitness.${t}`,
        ).toBeTypeOf('number')
      }
    }
  })

  it('enforces embedding pricing invariant (output_per_1m === 0)', () => {
    const embeddingModels = getAllModels().filter(m => m.model_class === 'embedding')
    expect(embeddingModels.length).toBeGreaterThan(0)
    for (const m of embeddingModels) {
      expect(
        m.pricing.output_per_1m,
        `${m.slug}: embedding APIs bill input only — output_per_1m must be 0`,
      ).toBe(0)
    }
  })

  it('every embedding model declares embedding_dim and max_input_tokens', () => {
    const embeddingModels = getAllModels().filter(m => m.model_class === 'embedding')
    for (const m of embeddingModels) {
      expect(m.embedding_dim, `${m.slug}: embedding_dim required`).toBeTypeOf('number')
      expect(m.max_input_tokens, `${m.slug}: max_input_tokens required`).toBeTypeOf('number')
    }
  })
})
