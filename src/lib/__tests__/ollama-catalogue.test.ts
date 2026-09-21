import { describe, expect, it, vi } from 'vitest'
import {
  fetchOllamaCloudModels,
  findOllamaCatalogueMatch,
  normaliseOllamaModelName,
  ollamaModelNamesCompatible,
} from '../ollama-catalogue'

describe('Ollama catalogue adapter', () => {
  it('fetches the public cloud model catalogue', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      models: [{
        name: 'gemma4:31b',
        model: 'gemma4:31b',
        size: 62_000_000_000,
        details: { parameter_size: '31B' },
      }],
    }), { status: 200 }))

    const models = await fetchOllamaCloudModels({ fetchImpl: fetchImpl as typeof fetch })
    expect(models).toHaveLength(1)
    expect(models[0].model).toBe('gemma4:31b')
  })

  it('normalises tags and punctuation for catalogue matching', () => {
    expect(normaliseOllamaModelName('Qwen3.5:397B')).toBe('qwen35397b')
    expect(normaliseOllamaModelName('gemma4:latest')).toBe('gemma4')
  })

  it('finds an exact normalised candidate without fuzzy guessing', () => {
    const match = findOllamaCatalogueMatch([
      { name: 'qwen3.5:397b', model: 'qwen3.5:397b' },
      { name: 'gemma4:31b', model: 'gemma4:31b' },
    ], ['Qwen3.5-397B'])

    expect(match?.model).toBe('qwen3.5:397b')
  })

  it('accepts compatible quantisation and instruction variants without crossing parameter sizes', () => {
    expect(ollamaModelNamesCompatible(
      'gemma3:27b-it-q4_K_M',
      'gemma3:27b',
    )).toBe(true)
    expect(ollamaModelNamesCompatible(
      'qwen3.5:9b',
      'qwen3.5:9b-q8_0',
    )).toBe(true)
    expect(ollamaModelNamesCompatible(
      'qwen3.5:9b',
      'qwen3.5:397b',
    )).toBe(false)
  })

  it('falls back to a compatible installed variant when the reviewed tag is not exact', () => {
    const match = findOllamaCatalogueMatch([
      { name: 'gemma3:27b', model: 'gemma3:27b' },
    ], ['gemma3:27b-it-q4_K_M'])

    expect(match?.model).toBe('gemma3:27b')
  })

})
