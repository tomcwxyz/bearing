import { describe, it, expect } from 'vitest'
import { convertPricing, inferCapabilities, extractProvider } from '../openrouter'

describe('convertPricing', () => {
  it('converts per-token to per-1M tokens', () => {
    expect(convertPricing('0.000003', '0.000015')).toEqual({ input_per_1m: 3, output_per_1m: 15 })
  })
  it('handles free models', () => {
    expect(convertPricing('0', '0')).toEqual({ input_per_1m: 0, output_per_1m: 0 })
  })
})

describe('inferCapabilities', () => {
  it('infers vision from image input', () => {
    const caps = inferCapabilities(['text', 'image'], ['text'], ['tools', 'structured_outputs'])
    expect(caps).toContain('vision')
    expect(caps).toContain('tools')
    expect(caps).toContain('structured_output')
  })
  it('infers extended_thinking from reasoning param', () => {
    const caps = inferCapabilities(['text'], ['text'], ['include_reasoning'])
    expect(caps).toContain('extended_thinking')
  })
  it('infers long_context when context_length >= 128K', () => {
    expect(inferCapabilities(['text'], ['text'], [], 128_000)).toContain('long_context')
    expect(inferCapabilities(['text'], ['text'], [], 200_000)).toContain('long_context')
    expect(inferCapabilities(['text'], ['text'], [], 64_000)).not.toContain('long_context')
    expect(inferCapabilities(['text'], ['text'], [])).not.toContain('long_context')
  })
})

describe('extractProvider', () => {
  it('maps known prefixes', () => {
    expect(extractProvider('anthropic/claude-opus-4.6')).toBe('Anthropic')
    expect(extractProvider('openai/gpt-5.4')).toBe('OpenAI')
  })
  it('returns raw prefix for unknown', () => {
    expect(extractProvider('newco/model-x')).toBe('newco')
  })
})
