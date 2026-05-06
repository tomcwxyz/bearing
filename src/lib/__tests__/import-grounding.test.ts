import { describe, it, expect } from 'vitest'
import { normaliseModelName, tokenise, suggestBenchmarkAliases } from '../import-grounding'

const AA_SAMPLE = [
  // Claude variants — multiple per family by reasoning/effort.
  { name: 'Claude 4.5 Haiku (Non-reasoning)', slug: 'claude-4-5-haiku' },
  { name: 'Claude 4.5 Haiku (Reasoning)', slug: 'claude-4-5-haiku-reasoning' },
  { name: 'Claude 3 Haiku', slug: 'claude-3-haiku' },
  { name: 'Claude Opus 4.6 (Adaptive Reasoning, Max Effort)', slug: 'claude-opus-4-6-adaptive' },
  { name: 'Claude Opus 4.6 (Non-reasoning, High Effort)', slug: 'claude-opus-4-6' },
  { name: 'Claude Sonnet 4.6 (Non-reasoning, Low Effort)', slug: 'claude-sonnet-4-6-non-reasoning-low-effort' },
  { name: 'Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort)', slug: 'claude-sonnet-4-6-adaptive' },
  { name: 'Claude Sonnet 4.6 (Non-reasoning, High Effort)', slug: 'claude-sonnet-4-6' },

  // DeepSeek family with distill siblings.
  { name: 'DeepSeek R1 0528 (May \'25)', slug: 'deepseek-r1' },
  { name: 'DeepSeek R1 (Jan \'25)', slug: 'deepseek-r1-0120' },
  { name: 'DeepSeek R1 Distill Llama 70B', slug: 'deepseek-r1-distill-llama-70b' },
  { name: 'DeepSeek R1 Distill Qwen 32B', slug: 'deepseek-r1-distill-qwen-32b' },
  { name: 'DeepSeek V3.1 (Non-reasoning)', slug: 'deepseek-v3-1' },
  { name: 'DeepSeek V3.1 (Reasoning)', slug: 'deepseek-v3-1-reasoning' },
  { name: 'DeepSeek V3.2 (Non-reasoning)', slug: 'deepseek-v3-2' },
  { name: 'DeepSeek V3.2 (Reasoning)', slug: 'deepseek-v3-2-reasoning' },

  // Gemini — Preview suffix and Flash-Lite variant.
  { name: 'Gemini 2.5 Flash-Lite (Non-reasoning)', slug: 'gemini-2-5-flash-lite' },
  { name: 'Gemini 2.5 Flash-Lite (Reasoning)', slug: 'gemini-2-5-flash-lite-reasoning' },
  { name: 'Gemini 3 Flash Preview (Non-reasoning)', slug: 'gemini-3-flash' },
  { name: 'Gemini 3 Flash Preview (Reasoning)', slug: 'gemini-3-flash-reasoning' },
  { name: 'Gemini 3.1 Pro Preview', slug: 'gemini-3-1-pro-preview' },

  // GPT — base, mini, nano siblings.
  { name: 'GPT-5.4 (low)', slug: 'gpt-5-4-low' },
  { name: 'GPT-5.4 (xhigh)', slug: 'gpt-5-4-xhigh' },
  { name: 'GPT-5.4 (Non-reasoning)', slug: 'gpt-5-4-non-reasoning' },
  { name: 'GPT-5.4 mini (xhigh)', slug: 'gpt-5-4-mini-xhigh' },
  { name: 'GPT-5.4 mini (medium)', slug: 'gpt-5-4-mini-medium' },
  { name: 'GPT-5.4 nano (xhigh)', slug: 'gpt-5-4-nano-xhigh' },
  { name: 'GPT-5.4 nano (medium)', slug: 'gpt-5-4-nano-medium' },

  // Single-entry models.
  { name: 'Grok 4', slug: 'grok-4' },
  { name: 'Grok 4 Fast (Reasoning)', slug: 'grok-4-fast-reasoning' },
  { name: 'Llama 4 Maverick', slug: 'llama-4-maverick' },
  { name: 'Llama 4 Scout', slug: 'llama-4-scout' },
  { name: 'MiniMax-M2.5', slug: 'minimax-m2-5' },
  { name: 'MiniMax-M2.7', slug: 'minimax-m2-7' },
  { name: 'Mistral Medium 3', slug: 'mistral-medium-3' },
  { name: 'Mistral Large 3', slug: 'mistral-large-3' },
  { name: 'Mistral Small 3', slug: 'mistral-small-3' },
  { name: 'Kimi K2', slug: 'kimi-k2' },
  { name: 'Kimi K2 Thinking', slug: 'kimi-k2-thinking' },
  { name: 'Kimi K2.5 (Non-reasoning)', slug: 'kimi-k2-5' },
  { name: 'Kimi K2.5 (Reasoning)', slug: 'kimi-k2-5-reasoning' },

  // Qwen — VL is a vision-language sibling.
  { name: 'Qwen3 235B A22B (Non-reasoning)', slug: 'qwen3-235b-a22b' },
  { name: 'Qwen3 235B A22B (Reasoning)', slug: 'qwen3-235b-a22b-reasoning' },
  { name: 'Qwen3 VL 235B A22B Instruct', slug: 'qwen3-vl-235b-a22b' },
  { name: 'Qwen3.5 397B A17B (Non-reasoning)', slug: 'qwen3-5-397b-a17b' },
  { name: 'Qwen3.5 397B A17B (Reasoning)', slug: 'qwen3-5-397b-a17b-reasoning' },
  { name: 'Qwen2.5 Instruct 72B', slug: 'qwen-2-5-72b-instruct' },
]

const meta = (slug: string, name: string, provider: string) => ({ slug, name, provider })

describe('normaliseModelName', () => {
  it('strips parenthetical effort/reasoning markers', () => {
    expect(normaliseModelName('Claude 4.5 Haiku (Non-reasoning)')).toBe('claude 4.5 haiku')
    expect(normaliseModelName('Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort)')).toBe('claude sonnet 4.6')
  })

  it('preserves outside-paren product names like "Medium"', () => {
    expect(normaliseModelName('Mistral Medium 3')).toBe('mistral medium 3')
  })

  it('strips date suffixes', () => {
    expect(normaliseModelName("DeepSeek R1 0528 (May '25)")).toBe('deepseek r1 0528')
  })

  it('strips Preview / Experimental outside parens', () => {
    expect(normaliseModelName('Gemini 3.1 Pro Preview')).toBe('gemini 3.1 pro')
  })
})

describe('tokenise', () => {
  it('produces equivalent bags for split vs joined family-version forms', () => {
    const split = tokenise('Qwen 3 235B')
    const joined = tokenise('Qwen3 235B')
    // both should contain the same canonical atoms
    for (const t of ['qwen', '3', '235b']) {
      expect(split.has(t)).toBe(true)
      expect(joined.has(t)).toBe(true)
    }
  })

  it('emits joined token AND split atoms when alpha >= 2 chars precedes digits', () => {
    const t = tokenise('Claude4.5 Haiku')
    expect(t.has('claude4.5')).toBe(true)
    expect(t.has('claude')).toBe(true)
    expect(t.has('4.5')).toBe(true)
  })

  it('does not split single-letter+digit tokens like "k2" or "r1"', () => {
    const t = tokenise('Kimi K2')
    expect(t.has('k2')).toBe(true)
    expect(t.has('k')).toBe(false)
  })

  it('treats hyphens and underscores as separators', () => {
    const a = tokenise('claude-haiku-4.5')
    const b = tokenise('Claude Haiku 4.5')
    for (const t of a) expect(b.has(t)).toBe(true)
  })
})

describe('suggestBenchmarkAliases', () => {
  it('returns both reasoning + non-reasoning AA variants for one bearing slug', () => {
    const out = suggestBenchmarkAliases(
      meta('claude-haiku-4.5', 'Claude Haiku 4.5', 'Anthropic'),
      'artificialanalysis',
      AA_SAMPLE,
    )
    const names = out.map(s => s.name)
    expect(names).toContain('Claude 4.5 Haiku (Non-reasoning)')
    expect(names).toContain('Claude 4.5 Haiku (Reasoning)')
    expect(names).not.toContain('Claude 3 Haiku')
  })

  it('matches all three Claude Sonnet 4.6 effort variants', () => {
    const out = suggestBenchmarkAliases(
      meta('claude-sonnet-4.6', 'Claude Sonnet 4.6', 'Anthropic'),
      'artificialanalysis',
      AA_SAMPLE,
    )
    const sonnetMatches = out.filter(s => s.name.includes('Sonnet 4.6'))
    expect(sonnetMatches.length).toBe(3)
  })

  it('flags GPT-5.4 mini/nano siblings rather than excluding them, ranking unflagged first', () => {
    const out = suggestBenchmarkAliases(
      meta('gpt-5.4', 'GPT 5.4', 'OpenAI'),
      'artificialanalysis',
      AA_SAMPLE,
    )
    // Top results have no flags (the base GPT-5.4 variants), not mini/nano.
    expect(out[0].flags).toEqual([])
    expect(out[0].name.includes('mini')).toBe(false)
    expect(out[0].name.includes('nano')).toBe(false)
    expect(out[0].name).toMatch(/^GPT-5\.4 \(/)
    // mini/nano variants are present but flagged.
    const mini = out.find(s => s.name.includes('mini'))
    expect(mini).toBeDefined()
    expect(mini!.flags).toContain('mini')
    const nano = out.find(s => s.name.includes('nano'))
    expect(nano!.flags).toContain('nano')
  })

  it('flags distill variants when matching a base reasoning model', () => {
    const out = suggestBenchmarkAliases(
      meta('deepseek-r1', 'DeepSeek R1', 'DeepSeek'),
      'artificialanalysis',
      AA_SAMPLE,
    )
    const distills = out.filter(s => s.flags.includes('distill'))
    expect(distills.length).toBeGreaterThanOrEqual(2)
    const base = out.find(s => s.name.startsWith('DeepSeek R1 0528'))
    expect(base?.flags).not.toContain('distill')
    // Base match sorts above distill variants.
    expect(out.indexOf(base!)).toBeLessThan(out.findIndex(s => s.flags.includes('distill')))
  })

  it('flags VL variants when matching the base Qwen3 235B', () => {
    const out = suggestBenchmarkAliases(
      meta('qwen3-235b-a22b', 'Qwen 3 235B', 'Alibaba'),
      'artificialanalysis',
      AA_SAMPLE,
    )
    const vl = out.find(s => s.name.includes('VL'))
    expect(vl?.flags).toContain('vl')
    const base = out.find(s => s.name === 'Qwen3 235B A22B (Non-reasoning)')
    expect(base?.flags).not.toContain('vl')
  })

  it('matches "Grok 4" exactly and flags "Grok 4 Fast" sibling', () => {
    const out = suggestBenchmarkAliases(
      meta('grok-4', 'Grok 4', 'xAI'),
      'artificialanalysis',
      AA_SAMPLE,
    )
    const names = out.map(s => s.name)
    expect(names).toContain('Grok 4')
    const fast = out.find(s => s.name === 'Grok 4 Fast (Reasoning)')
    expect(fast?.flags).toContain('fast')
    expect(out[0].name).toBe('Grok 4')
  })

  it('matches MiniMax-M2.5 vs M2.7 distinctly', () => {
    const m25 = suggestBenchmarkAliases(
      meta('minimax-m2.5', 'MiniMax M2.5', 'MiniMax'),
      'artificialanalysis',
      AA_SAMPLE,
    )
    expect(m25.map(s => s.name)).toEqual(['MiniMax-M2.5'])
    const m27 = suggestBenchmarkAliases(
      meta('minimax-m2.7', 'MiniMax M2.7', 'MiniMax'),
      'artificialanalysis',
      AA_SAMPLE,
    )
    expect(m27.map(s => s.name)).toEqual(['MiniMax-M2.7'])
  })

  it('does not return Mistral Large/Small when matching Mistral Medium 3', () => {
    // "medium" is in the query, "large"/"small" are not — they fail subset.
    const out = suggestBenchmarkAliases(
      meta('mistral-medium-3', 'Mistral Medium 3', 'Mistral'),
      'artificialanalysis',
      AA_SAMPLE,
    )
    expect(out.map(s => s.name)).toEqual(['Mistral Medium 3'])
  })

  it('returns empty for the no-AA-coverage allowlist', () => {
    expect(suggestBenchmarkAliases(
      meta('greenpt-greenl', 'GreenPT GreenL', 'GreenPT'),
      'artificialanalysis', AA_SAMPLE,
    )).toEqual([])
    expect(suggestBenchmarkAliases(
      meta('codestral-25.01', 'Codestral 25.01', 'Mistral'),
      'artificialanalysis', AA_SAMPLE,
    )).toEqual([])
    expect(suggestBenchmarkAliases(
      meta('mistral-ocr', 'Mistral OCR', 'Mistral'),
      'artificialanalysis', AA_SAMPLE,
    )).toEqual([])
    expect(suggestBenchmarkAliases(
      meta('ibm-granite-3.3', 'IBM Granite 3.3', 'IBM'),
      'artificialanalysis', AA_SAMPLE,
    )).toEqual([])
  })

  it('within unflagged results, sorts by score descending', () => {
    const out = suggestBenchmarkAliases(
      meta('claude-sonnet-4.6', 'Claude Sonnet 4.6', 'Anthropic'),
      'artificialanalysis',
      AA_SAMPLE,
    ).filter(s => s.flags.length === 0)
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score)
    }
  })
})
