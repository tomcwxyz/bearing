import { describe, it, expect } from 'vitest'
import { convertPricing, inferCapabilities, extractProvider, parseOpenRouterError } from '../openrouter'

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
  it('maps open-weight provider prefixes to their profile names', () => {
    expect(extractProvider('liquid/lfm-2-24b-a2b')).toBe('Liquid')
    expect(extractProvider('z-ai/glm-4.6')).toBe('Z.ai')
    expect(extractProvider('microsoft/phi-4')).toBe('Microsoft')
    expect(extractProvider('nvidia/nemotron-3-nano')).toBe('NVIDIA')
    expect(extractProvider('allenai/olmo-3-32b')).toBe('AllenAI')
    expect(extractProvider('nousresearch/hermes-4-70b')).toBe('Nous Research')
  })
  it('maps the wider open-model catalogue prefixes to their profile names', () => {
    expect(extractProvider('databricks/dbrx-instruct')).toBe('Databricks')
    expect(extractProvider('bytedance/seed-oss-36b')).toBe('ByteDance')
    expect(extractProvider('baidu/ernie-4.5-300b-a47b')).toBe('Baidu')
    expect(extractProvider('tencent/hunyuan-a13b')).toBe('Tencent')
    expect(extractProvider('01-ai/yi-1.5-34b')).toBe('01.AI')
    expect(extractProvider('internlm/internlm3-8b')).toBe('Shanghai AI Lab')
    expect(extractProvider('tiiuae/falcon-h1-34b')).toBe('TII')
    expect(extractProvider('upstage/solar-pro-2')).toBe('Upstage')
    expect(extractProvider('nomic/nomic-embed-text-v2-moe')).toBe('Nomic AI')
  })
  it('returns raw prefix for unknown', () => {
    expect(extractProvider('newco/model-x')).toBe('newco')
  })
})

describe('parseOpenRouterError', () => {
  it('maps OpenRouter JSON context-overflow to a friendly message', () => {
    const body = JSON.stringify({
      error: { message: 'This endpoint\'s maximum context length is 128000 tokens. However, you requested about 150000 tokens.' },
    })
    const msg = parseOpenRouterError(400, body)
    expect(msg).toContain('Prompt too long for this model')
    expect(msg).toContain('128000')
    expect(msg).toContain('150000')
  })

  it('maps GreenPT plain-text context-overflow (text path) to a friendly message', () => {
    // GreenPT returns a non-JSON body for these errors.
    const body = "400 You passed 152485 input tokens and requested 2048 output tokens. However, the model's context length is only 131072 tokens, resulting in a maximum input length of 129024 tokens. Please reduce the length of the input prompt. (parameter=input_tokens, value=152485)"
    const msg = parseOpenRouterError(400, body)
    expect(msg).toContain('Prompt too long for this model')
    expect(msg).toContain('131072')
    expect(msg).toContain('152485')
    expect(msg).toContain('file')
  })

  it('maps the GreenPT vision/base64 negative-budget error to a friendly message', () => {
    // The exact error a file attachment produced on the vision path.
    const body = '400 max_tokens must be at least 1, got -140900. (parameter=max_tokens, value=-140900)'
    const msg = parseOpenRouterError(400, body)
    expect(msg).toContain('Prompt too long for this model')
    expect(msg).not.toContain('-140900')
  })

  it('does not surface raw unrecognised text bodies', () => {
    expect(parseOpenRouterError(500, 'Internal Server Error gobbledygook')).toBe('Model request failed (HTTP 500)')
  })

  it('surfaces a structured provider message when present', () => {
    const body = JSON.stringify({ error: { message: 'Custom provider message' } })
    expect(parseOpenRouterError(400, body)).toBe('Custom provider message')
  })

  it('reports rate limiting on 429', () => {
    expect(parseOpenRouterError(429, '')).toContain('Rate limited')
  })
})
