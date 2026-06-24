import { describe, it, expect } from 'vitest'
import { getRegistry, getModel, getAllModels, getModelSlugs, computeSustainabilityComposite, withSustainabilityComposite, ALL_TASK_TYPES, TASK_TYPE_LABELS } from '../registry'
import { CATEGORY_TO_TASKS } from '../benchmarks'

describe('computeSustainabilityComposite', () => {
  it('averages all three non-null sub-dimensions, rounded to 2dp', () => {
    // (0.9 + 0.4 + 0.5) / 3 = 0.6
    expect(computeSustainabilityComposite(
      { inference_energy: 0.9, provider_infrastructure: 0.4, training_footprint: 0.5 }, 0,
    )).toBe(0.6)
  })

  it('excludes null sub-dimensions from the mean', () => {
    // mean of the two present values, not divided by three
    expect(computeSustainabilityComposite(
      { inference_energy: 0.9, provider_infrastructure: 0.4, training_footprint: null }, 0,
    )).toBe(0.65)
  })

  it('reflects an eco-grounded inference_energy override', () => {
    // Haiku guessed 0.7 → composite 0.55; eco regrounds inference_energy to 0.9.
    const before = computeSustainabilityComposite(
      { inference_energy: 0.7, provider_infrastructure: 0.4, training_footprint: null }, 0.55,
    )
    const after = computeSustainabilityComposite(
      { inference_energy: 0.9, provider_infrastructure: 0.4, training_footprint: null }, 0.55,
    )
    expect(before).toBe(0.55)
    expect(after).toBe(0.65) // composite tracks the override, no longer stale
  })

  it('falls back to the supplied value when every sub-dimension is null', () => {
    expect(computeSustainabilityComposite(
      { inference_energy: null, provider_infrastructure: null, training_footprint: null }, 0.42,
    )).toBe(0.42)
  })

  it('rounds to two decimal places', () => {
    // (0.1 + 0.2) / 2 = 0.15000000000000002 → 0.15
    expect(computeSustainabilityComposite(
      { inference_energy: 0.1, provider_infrastructure: 0.2, training_footprint: null }, 0,
    )).toBe(0.15)
  })
})

describe('withSustainabilityComposite', () => {
  it('recomputes the composite and preserves other fields', () => {
    const result = withSustainabilityComposite({
      inference_energy: 0.9,
      provider_infrastructure: 0.4,
      training_footprint: 0.5,
      sustainability_score: 0.55, // stale
      notes: 'keep me',
    })
    expect(result.sustainability_score).toBe(0.6) // recomputed from sub-dims
    expect(result.notes).toBe('keep me')
    expect(result.inference_energy).toBe(0.9)
  })

  it('keeps the existing composite when all sub-dimensions are null', () => {
    const result = withSustainabilityComposite({
      inference_energy: null,
      provider_infrastructure: null,
      training_footprint: null,
      sustainability_score: 0.42,
    })
    expect(result.sustainability_score).toBe(0.42)
  })
})

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

  it('every CATEGORY_TO_TASKS entry maps to a valid TaskType', () => {
    const validTypes = new Set<string>(ALL_TASK_TYPES as readonly string[])
    for (const [source, cats] of Object.entries(CATEGORY_TO_TASKS)) {
      for (const [cat, tasks] of Object.entries(cats)) {
        for (const t of tasks) {
          expect(
            validTypes.has(t),
            `CATEGORY_TO_TASKS.${source}.${cat} points at unknown task type "${t}"`,
          ).toBe(true)
        }
      }
    }
  })

  it('all four mteb sub-categories + overall map to embedding only', () => {
    const mteb = CATEGORY_TO_TASKS.mteb
    expect(mteb).toBeDefined()
    for (const cat of ['overall', 'retrieval', 'sts', 'classification', 'clustering']) {
      expect(mteb[cat], `mteb.${cat} should be defined`).toEqual(['embedding'])
    }
  })
})
