import { describe, it, expect } from 'vitest'
import { compareModelIdentity } from '../model-identity'
import { rankSourceNames, rankSlugs, autoMatchSlug } from '../alias-matching'

describe('deterministic model identity', () => {
  const mistral = { name: 'Mistral Large 4', provider: 'Mistral' }

  it('surfaces a differently labelled preview, but never auto-approves it', () => {
    const m = compareModelIdentity(mistral, { name: 'Mistral Large 4 Preview' })
    expect(m?.score).toBe(1)
    expect(m?.flags).toContain('variant: preview')
    expect(m?.autoEligible).toBe(false)
  })

  it('auto-eligible canonical match has matching provider, family and version', () => {
    const m = compareModelIdentity({ name: 'Claude Haiku 4.5', provider: 'Anthropic' }, { name: 'Claude 4.5 Haiku' })
    expect(m?.autoEligible).toBe(true)
  })

  it('rejects different versions, even if every other token overlaps', () => {
    expect(compareModelIdentity({ name: 'Claude Haiku 4.5', provider: 'Anthropic' }, { name: 'Claude Haiku 5.5' })).toBeNull()
    expect(compareModelIdentity({ name: 'Mistral Large 4', provider: 'Mistral' }, { name: 'Mistral Large 3' })).toBeNull()
    expect(compareModelIdentity({ name: 'MiniMax M2.7', provider: 'MiniMax' }, { name: 'MiniMax M2.5' })).toBeNull()
  })

  it('blocks sibling families and known provider conflicts', () => {
    expect(compareModelIdentity({ name: 'Claude 4.5 Haiku' }, { name: 'Claude 4.5 Sonnet' })).toBeNull()
    expect(compareModelIdentity({ name: 'Mistral Large 4' }, { name: 'Mistral Small 4' })).toBeNull()
    expect(compareModelIdentity({ name: 'GPT-5.4 mini' }, { name: 'GPT-5.4 nano' })).toBeNull()
    expect(compareModelIdentity({ name: 'Claude Haiku 4.5', provider: 'OpenAI' }, { name: 'Claude Haiku 4.5' })).toBeNull()
  })

  it('keeps revision and reasoning variants separate', () => {
    expect(compareModelIdentity({ name: 'DeepSeek R1 0528' }, { name: 'DeepSeek R1 0120' })?.autoEligible).not.toBe(true)
    expect(compareModelIdentity({ name: 'GPT-5.6 Sol' }, { name: 'GPT-5.6 Sol (xhigh)' })?.autoEligible).toBe(false)
    expect(compareModelIdentity({ name: 'Qwen3 235B A22B' }, { name: 'Qwen3 VL 235B A22B Instruct' })?.autoEligible).toBe(false)
  })

  it('finds lexical typos as reviewable suggestions, not aliases', () => {
    const m = compareModelIdentity({ name: 'Claude Haiku 4.5' }, { name: 'Claude Hakku 4.5' })
    expect(m).not.toBeNull()
    expect(m?.flags).toContain('fuzzy name — review')
    expect(m?.autoEligible).toBe(false)
  })

  it('uses a second-stage similarity search only when strict tokens miss', () => {
    const model = { slug: 'claude-haiku-4.5', name: 'Anthropic: Claude Haiku 4.5', provider: 'Anthropic' }
    const candidates = rankSourceNames(model, [{ name: 'Claude Hakku 4.5' }, { name: 'Claude 5.5 Hakku' }])
    expect(candidates.map(c => c.name)).toEqual(['Claude Hakku 4.5'])
    expect(candidates[0].flags).toContain('fuzzy name — review')
    expect(rankSlugs('Claude Hakku 4.5', [model])[0].slug).toBe(model.slug)
    expect(autoMatchSlug('Claude Hakku 4.5', [model])).toBeNull()
  })

  it('avoids fuzzy matching unrecognised model families', () => {
    expect(compareModelIdentity({ name: 'unknown model 5.6' }, { name: 'unknown moden 5.6' })).toBeNull()
  })

  it('handles split and joined Qwen versions deterministically', () => {
    const m = compareModelIdentity({ name: 'Qwen3 235B A22B', provider: 'Alibaba' }, { name: 'Qwen 3 235B A22B' })
    expect(m?.autoEligible).toBe(true)
  })
})
