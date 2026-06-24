import { describe, it, expect } from 'vitest'
import {
  matchTokens, tokenise, rankSlugs, rankSourceNames, autoMatchSlug,
  type BearingModelMeta,
} from '../alias-matching'
import { resolveModelName } from '../ecologits-grounding'

// Mirrors the AA naming realities the matcher has to absorb.
const AA_SAMPLE = [
  { name: 'Claude 4.5 Haiku (Non-reasoning)' },
  { name: 'Claude 4.5 Haiku (Reasoning)' },
  { name: 'Claude 3 Haiku' },
  { name: 'GPT-5.4 (xhigh)' },
  { name: 'GPT-5.4 mini (medium)' },
  { name: 'Qwen3 235B A22B (Non-reasoning)' },
  { name: 'Qwen3 VL 235B A22B Instruct' },
  { name: 'Mistral Large 3' },
  { name: 'Mistral Medium 3' },
]

const models: BearingModelMeta[] = [
  { slug: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', provider: 'Anthropic' },
  { slug: 'gpt-5.4', name: 'GPT 5.4', provider: 'OpenAI' },
  { slug: 'qwen3-235b-a22b', name: 'Qwen 3 235B', provider: 'Alibaba' },
  { slug: 'mistral-large-3', name: 'Mistral Large 3', provider: 'Mistral' },
  { slug: 'mistral-medium-3', name: 'Mistral Medium 3', provider: 'Mistral' },
]

describe('matchTokens — confidence tiers', () => {
  it('identical token bags are exact', () => {
    const m = matchTokens(tokenise('Claude Haiku 4.5'), tokenise('Claude 4.5 Haiku (Reasoning)'))
    expect(m.subset).toBe(true)
    expect(m.flags).toEqual([])
    expect(m.confidence).toBe('exact')
    expect(m.score).toBe(1)
  })

  it('flagged subset is weak even at high score', () => {
    // VL is a disambiguator present in source but not the model.
    const m = matchTokens(tokenise('qwen3-235b-a22b Qwen 3 235B'), tokenise('Qwen3 VL 235B A22B Instruct'))
    expect(m.subset).toBe(true)
    expect(m.flags).toContain('vl')
    expect(m.confidence).toBe('weak')
  })

  it('flagless partial cover (a real version/family difference) is not exact', () => {
    // "mistral-large" lacks the version token "3" the source carries.
    const m = matchTokens(tokenise('mistral-large Mistral Large'), tokenise('Mistral Large 3'))
    expect(m.subset).toBe(true)
    expect(m.flags).toEqual([])
    expect(m.confidence).not.toBe('exact')
  })

  it('non-subset is weak with no flags', () => {
    const m = matchTokens(tokenise('Mistral Medium 3'), tokenise('Mistral Large 3'))
    expect(m.subset).toBe(false)
    expect(m.confidence).toBe('weak')
  })
})

describe('rankSourceNames (forward, import form)', () => {
  it('returns both reasoning + non-reasoning variants, excludes Claude 3', () => {
    const out = rankSourceNames(models[0], AA_SAMPLE)
    const names = out.map(s => s.name)
    expect(names).toContain('Claude 4.5 Haiku (Non-reasoning)')
    expect(names).toContain('Claude 4.5 Haiku (Reasoning)')
    expect(names).not.toContain('Claude 3 Haiku')
  })

  it('flags mini sibling, ranks unflagged base first', () => {
    const out = rankSourceNames(models[1], AA_SAMPLE)
    expect(out[0].name).toBe('GPT-5.4 (xhigh)')
    expect(out[0].flags).toEqual([])
    const mini = out.find(s => s.name.includes('mini'))
    expect(mini?.flags).toContain('mini')
  })

  it("ignores the vendor prefix in OpenRouter display names ('Anthropic: …')", () => {
    // Discover imports carry OpenRouter's "Vendor: Model" name. The leaked
    // provider token must not block an otherwise-clean match.
    const orModel: BearingModelMeta = {
      slug: 'claude-haiku-4.5',
      name: 'Anthropic: Claude Haiku 4.5',
      provider: 'Anthropic',
    }
    const names = rankSourceNames(orModel, AA_SAMPLE).map(s => s.name)
    expect(names).toContain('Claude 4.5 Haiku (Reasoning)')
    expect(names).toContain('Claude 4.5 Haiku (Non-reasoning)')
  })
})

describe('rankSlugs (reverse, unmatched UI)', () => {
  it('maps a source name to the right slug as exact', () => {
    const out = rankSlugs('Claude 4.5 Haiku (Reasoning)', models)
    expect(out[0].slug).toBe('claude-haiku-4.5')
    expect(out[0].confidence).toBe('exact')
  })

  it('every paren-effort GPT variant resolves to the base slug', () => {
    expect(rankSlugs('GPT-5.4 (xhigh)', models)[0].slug).toBe('gpt-5.4')
  })

  it('VL source name does not exact-match the base qwen slug', () => {
    const out = rankSlugs('Qwen3 VL 235B A22B Instruct', models)
    const qwen = out.find(r => r.slug === 'qwen3-235b-a22b')
    expect(qwen?.confidence).toBe('weak')
    expect(qwen?.flags).toContain('vl')
  })

  it('distinguishes Mistral Large 3 from Medium 3', () => {
    expect(rankSlugs('Mistral Large 3', models)[0].slug).toBe('mistral-large-3')
    expect(rankSlugs('Mistral Medium 3', models)[0].slug).toBe('mistral-medium-3')
  })
})

describe('autoMatchSlug (strict auto-apply)', () => {
  it('applies an exact-unique match', () => {
    expect(autoMatchSlug('Claude 4.5 Haiku (Non-reasoning)', models)).toBe('claude-haiku-4.5')
  })

  it('refuses a flagged (VL) match', () => {
    expect(autoMatchSlug('Qwen3 VL 235B A22B Instruct', models)).toBeNull()
  })

  it('refuses when no model matches', () => {
    expect(autoMatchSlug('Some Unknown Model 9000', models)).toBeNull()
  })

  it('refuses a partial/version-only match (not exact)', () => {
    // Only a model lacking the version token would partial-match; ensure such a
    // case is never auto-applied.
    const partial: BearingModelMeta[] = [{ slug: 'mistral-large', name: 'Mistral Large', provider: 'Mistral' }]
    expect(autoMatchSlug('Mistral Large 3', partial)).toBeNull()
  })
})

// Hyphen-versioned source names (lmarena uses "claude-opus-4-8") must reconcile
// with the registry's dotted slugs ("claude-opus-4.8") without gluing date or
// param suffixes onto the version.
describe('version-separator tokenisation', () => {
  const lmModels: BearingModelMeta[] = [
    { slug: 'claude-opus-4.8', name: 'Claude Opus 4.8', provider: 'Anthropic' },
    { slug: 'claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'Anthropic' },
    { slug: 'grok-4', name: 'Grok 4', provider: 'xAI' },
    { slug: 'deepseek-r1', name: 'DeepSeek R1', provider: 'DeepSeek' },
    { slug: 'deepseek-r1-0528', name: 'DeepSeek R1 0528', provider: 'DeepSeek' },
  ]

  it('joins an inter-digit version separator into the dotted atom', () => {
    const toks = tokenise('claude-opus-4-8')
    expect(toks.has('4.8')).toBe(true)
    expect(toks.has('8')).toBe(false)
  })

  it('joins a multi-segment family version ("3-5" → "3.5")', () => {
    expect(tokenise('claude-3-5-sonnet').has('3.5')).toBe(true)
  })

  it('auto-matches a hyphenated lmarena name to the dotted slug', () => {
    expect(autoMatchSlug('claude-opus-4-6', lmModels)).toBe('claude-opus-4.6')
  })

  it('does not glue a date stamp onto the version (grok-4-0709)', () => {
    const toks = tokenise('grok-4-0709')
    expect(toks.has('4')).toBe(true)       // version stays its own token
    expect(toks.has('0709')).toBe(true)    // date stays separate, not "4.0709"
    expect(toks.has('4.0709')).toBe(false)
    // A trailing date makes it non-exact, so it is surfaced but never auto-applied.
    expect(autoMatchSlug('grok-4-0709', lmModels)).toBeNull()
  })

  it('keeps a param/date suffix distinct so two real models stay separate', () => {
    // "0528" is the only token distinguishing these registry models; the join
    // must not absorb it.
    expect(tokenise('deepseek-r1-0528').has('0528')).toBe(true)
    expect(autoMatchSlug('deepseek-r1', lmModels)).toBe('deepseek-r1')
    expect(autoMatchSlug('deepseek-r1-0528', lmModels)).toBe('deepseek-r1-0528')
  })

  it('forward import surfaces the hyphenated lmarena variant for a dotted slug', () => {
    const model: BearingModelMeta = {
      slug: 'claude-opus-4.8', name: 'Anthropic: Claude Opus 4.8', provider: 'Anthropic',
    }
    const ranked = rankSourceNames(model, [
      { name: 'claude-opus-4-8' },
      { name: 'claude-opus-4-8-thinking' },
      { name: 'claude-opus-4-7' },
    ])
    expect(ranked[0].name).toBe('claude-opus-4-8')
    expect(ranked[0].confidence).toBe('exact')
    const thinking = ranked.find(r => r.name === 'claude-opus-4-8-thinking')
    expect(thinking?.flags).toContain('thinking')
    expect(ranked.map(r => r.name)).not.toContain('claude-opus-4-7')
  })
})

// Characterization tests for the EcoLogits API-slug matcher. These pin the
// expected resolution outcomes so the move onto the shared tokeniser is safe.
describe('resolveModelName (EcoLogits API slugs)', () => {
  it('exact match after normalisation', () => {
    expect(resolveModelName('claude-3-5-sonnet', ['claude-3-5-sonnet', 'claude-3-haiku']))
      .toBe('claude-3-5-sonnet')
  })

  it('matches when EcoLogits adds a -preview suffix', () => {
    expect(resolveModelName('gemini-3-flash', ['gemini-3-flash-preview', 'gemini-3-pro']))
      .toBe('gemini-3-flash-preview')
  })

  it('prefers the exact name over longer siblings', () => {
    expect(resolveModelName('gpt-4', ['gpt-4', 'gpt-4-turbo', 'gpt-4o']))
      .toBe('gpt-4')
  })

  it('reverse: EcoLogits name is a less-specific prefix of the slug', () => {
    expect(resolveModelName('claude-3-5-sonnet-v2', ['claude-3-5-sonnet']))
      .toBe('claude-3-5-sonnet')
  })

  it('returns null when nothing matches', () => {
    expect(resolveModelName('random-model', ['gpt-4', 'claude-3-haiku'])).toBeNull()
  })
})
