import { describe, it, expect } from 'vitest'
import {
  normaliseModelName, tokenise, suggestBenchmarkAliases,
  aggregateGroundedFields, CODE_CAPABILITY_THRESHOLD, normaliseProvider,
  type SnapshotRowForGrounding,
} from '../import-grounding'

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

// ---------------------------------------------------------------------------
// aggregateGroundedFields
// ---------------------------------------------------------------------------

const taskRow = (source: 'lmarena' | 'livebench' | 'artificialanalysis', cat: string, n: number): SnapshotRowForGrounding => ({
  source, sourceCategory: cat, normalisedScore: n, rawScore: n, signalType: 'task',
})
const speedRow = (n: number, raw = 200): SnapshotRowForGrounding => ({
  source: 'artificialanalysis', sourceCategory: 'aa_speed', normalisedScore: n, rawScore: raw, signalType: 'speed',
})
const latencyRow = (n: number): SnapshotRowForGrounding => ({
  source: 'artificialanalysis', sourceCategory: 'aa_ttft', normalisedScore: n, rawScore: 1, signalType: 'latency',
})

describe('normaliseProvider', () => {
  it('returns canonical name when exact match', () => {
    expect(normaliseProvider('Anthropic')).toBe('Anthropic')
    expect(normaliseProvider('DeepSeek')).toBe('DeepSeek')
  })

  it('strips parenthetical suffixes', () => {
    expect(normaliseProvider('Alibaba (via hosted providers)')).toBe('Alibaba')
    expect(normaliseProvider('Mistral (open-weights)')).toBe('Mistral')
  })

  it('case-insensitive', () => {
    expect(normaliseProvider('anthropic')).toBe('Anthropic')
    expect(normaliseProvider('IBM')).toBe('IBM')
  })

  it('returns null for unknown providers', () => {
    expect(normaliseProvider('Newco')).toBeNull()
    expect(normaliseProvider('Random Inc.')).toBeNull()
  })

  it('grounding picks up the normalised provider profile', () => {
    const g = aggregateGroundedFields([], 'Alibaba (via hosted providers)')
    expect(g.openWeights.value).toBe(1)
    expect(g.openWeights.provenance).toBe('derived')
  })
})

describe('aggregateGroundedFields — provider profile', () => {
  it('marks known-provider profile as "derived"', () => {
    const g = aggregateGroundedFields([], 'DeepSeek')
    expect(g.privacyScore.value).toBe(0.5)
    expect(g.privacyScore.provenance).toBe('derived')
    expect(g.openWeights.value).toBe(1)
    expect(g.openWeights.provenance).toBe('derived')
    expect(g.baselineTransparency.value).toBe(0.65)
  })

  it('falls back to "default" provenance for unknown providers', () => {
    const g = aggregateGroundedFields([], 'Newco')
    expect(g.privacyScore.provenance).toBe('default')
    expect(g.openWeights.value).toBe(0)
    expect(g.openWeights.provenance).toBe('default')
  })

  it('open-weight providers get openWeights=1, closed get 0', () => {
    expect(aggregateGroundedFields([], 'Anthropic').openWeights.value).toBe(0)
    expect(aggregateGroundedFields([], 'OpenAI').openWeights.value).toBe(0)
    expect(aggregateGroundedFields([], 'Meta').openWeights.value).toBe(1)
    expect(aggregateGroundedFields([], 'Alibaba').openWeights.value).toBe(1)
    expect(aggregateGroundedFields([], 'Moonshot').openWeights.value).toBe(1)
    expect(aggregateGroundedFields([], 'IBM').openWeights.value).toBe(1)
  })

  it('grounds licence_openness: permissive open-weight high, closed low', () => {
    // Kimi (Moonshot) is MIT — must read as open, not proprietary.
    const moonshot = aggregateGroundedFields([], 'Moonshot')
    expect(moonshot.licenceOpenness.value).toBe(0.9)
    expect(moonshot.licenceOpenness.provenance).toBe('derived')
    // Closed vendors stay low.
    expect(aggregateGroundedFields([], 'Anthropic').licenceOpenness.value).toBeLessThanOrEqual(0.2)
    // Open weights under a restrictive licence (Meta community) sits in the middle.
    expect(aggregateGroundedFields([], 'Meta').licenceOpenness.value).toBe(0.6)
  })

  it('unknown providers get a conservative default licence_openness', () => {
    const g = aggregateGroundedFields([], 'Newco')
    expect(g.licenceOpenness.value).toBe(0.2)
    expect(g.licenceOpenness.provenance).toBe('default')
  })

  it('newly-added open-weight providers ground as open', () => {
    for (const p of ['Liquid', 'Z.ai', 'Microsoft', 'NVIDIA', 'AI21', 'AllenAI', 'Nous Research']) {
      const g = aggregateGroundedFields([], p)
      expect(g.openWeights.value, p).toBe(1)
      expect(g.openWeights.provenance, p).toBe('derived')
    }
    // Cohere ships weights but under a non-commercial licence: open weights, low licence.
    const cohere = aggregateGroundedFields([], 'Cohere')
    expect(cohere.openWeights.value).toBe(1)
    expect(cohere.licenceOpenness.value).toBeLessThanOrEqual(0.3)
    // OLMo is fully open — highest licence openness.
    expect(aggregateGroundedFields([], 'AllenAI').licenceOpenness.value).toBeGreaterThanOrEqual(0.9)
  })

  it('grounds the wider catalogue of open-model labs as open', () => {
    // A representative sample across regions and model classes.
    for (const p of [
      'Databricks', 'EleutherAI', 'Marin', 'Xiaomi', 'Tencent', '01.AI',
      'Huawei', 'Shanghai AI Lab', 'TII', 'Upstage', 'Sarvam AI',
      'Nomic AI', 'Mixedbread', 'Snowflake', 'BAAI',
    ]) {
      const g = aggregateGroundedFields([], p)
      expect(g.openWeights.value, p).toBe(1)
      expect(g.openWeights.provenance, p).toBe('derived')
    }
    // Fully-open labs carry the highest licence openness.
    expect(aggregateGroundedFields([], 'EleutherAI').licenceOpenness.value).toBeGreaterThanOrEqual(0.9)
    expect(aggregateGroundedFields([], 'Marin').licenceOpenness.value).toBeGreaterThanOrEqual(0.9)
    // Restricted-licence open-weight labs read as open weights, low licence.
    for (const p of ['Tencent', 'Baichuan', 'LG AI Research']) {
      const g = aggregateGroundedFields([], p)
      expect(g.openWeights.value, p).toBe(1)
      expect(g.licenceOpenness.value, p).toBeLessThanOrEqual(0.4)
    }
  })

  it('marks catalogue "mixed" labs closed by default, open for their open line', () => {
    // ByteDance: Doubao closed by default...
    expect(aggregateGroundedFields([], 'ByteDance', 'doubao-pro').openWeights.value).toBe(0)
    // ...but Seed-OSS / BAGEL ship open weights (Apache 2.0).
    const seed = aggregateGroundedFields([], 'ByteDance', 'seed-oss-36b')
    expect(seed.openWeights.value).toBe(1)
    expect(seed.openWeights.provenance).toBe('derived')
    expect(seed.licenceOpenness.value).toBe(0.9)
    // Baidu: ERNIE 5.0 closed, ERNIE 4.5 open.
    expect(aggregateGroundedFields([], 'Baidu', 'ernie-5.0').openWeights.value).toBe(0)
    const ernie = aggregateGroundedFields([], 'Baidu', 'ernie-4.5-300b-a47b')
    expect(ernie.openWeights.value).toBe(1)
    expect(ernie.licenceOpenness.value).toBe(0.9)
    // xAI: current Grok closed, older Grok-1 / Grok-2 open.
    expect(aggregateGroundedFields([], 'xAI', 'grok-4').openWeights.value).toBe(0)
    const grok2 = aggregateGroundedFields([], 'xAI', 'grok-2')
    expect(grok2.openWeights.value).toBe(1)
    expect(grok2.licenceOpenness.value).toBe(0.8)
  })

  it('lists closed API providers explicitly (derived, not default)', () => {
    const voyage = aggregateGroundedFields([], 'Voyage AI')
    expect(voyage.openWeights.value).toBe(0)
    expect(voyage.openWeights.provenance).toBe('derived')
  })

  it('resolves provider name variants to the same profile (punctuation/spacing)', () => {
    // Registry stores "z-ai"; the profile key is "Z.ai".
    expect(normaliseProvider('z-ai')).toBe('Z.ai')
    expect(normaliseProvider('Z.ai')).toBe('Z.ai')
    expect(aggregateGroundedFields([], 'z-ai').openWeights.value).toBe(1)
    expect(aggregateGroundedFields([], 'z-ai').openWeights.provenance).toBe('derived')
  })

  it('overrides open_weights for a closed provider\'s open-weight family', () => {
    // Google is closed (Gemini) by default...
    expect(aggregateGroundedFields([], 'Google', 'gemini-3-pro').openWeights.value).toBe(0)
    // ...but Gemma ships open weights under a permissive licence.
    const gemma = aggregateGroundedFields([], 'Google', 'gemma-4-26b-a4b')
    expect(gemma.openWeights.value).toBe(1)
    expect(gemma.openWeights.provenance).toBe('derived')
    expect(gemma.licenceOpenness.value).toBe(0.7)
    // OpenAI gpt-oss is Apache-licensed open weights.
    const oss = aggregateGroundedFields([], 'OpenAI', 'gpt-oss-120b')
    expect(oss.openWeights.value).toBe(1)
    expect(oss.licenceOpenness.value).toBe(0.9)
    // A closed flagship from the same provider is unaffected.
    expect(aggregateGroundedFields([], 'OpenAI', 'gpt-5.4').openWeights.value).toBe(0)
  })

  it('scopes the family override to its provider (no coincidental match)', () => {
    // "gemma" only flips open-weights when the provider is Google.
    expect(aggregateGroundedFields([], 'Anthropic', 'gemma-clone-1').openWeights.value).toBe(0)
    // Without a model id, behaviour is unchanged (provider-level verdict).
    expect(aggregateGroundedFields([], 'Google').openWeights.value).toBe(0)
  })
})

describe('aggregateGroundedFields — task bucketing', () => {
  it('routes AA livecodebench and lmarena coding into task_fitness.code', () => {
    const g = aggregateGroundedFields([
      taskRow('artificialanalysis', 'livecodebench', 0.8),
      taskRow('lmarena', 'coding', 0.6),
    ], 'Anthropic')
    expect(g.taskFitness.code?.value).toBe(0.7)
    expect(g.taskFitness.code?.provenance).toBe('benchmark')
    expect(g.taskFitness.code?.evidence).toEqual(['artificialanalysis::livecodebench', 'lmarena::coding'])
  })

  it('averages multiple categories that map to the same task', () => {
    const g = aggregateGroundedFields([
      taskRow('artificialanalysis', 'aa_math', 1.0),
      taskRow('artificialanalysis', 'math_500', 0.6),
      taskRow('artificialanalysis', 'aime_25', 0.8),
    ], 'Anthropic')
    // All three map to 'math' under v0.8 mapping → mean = 0.8
    expect(g.taskFitness.math?.value).toBe(0.8)
  })

  it('routes a single category into multiple bearing tasks (livebench language)', () => {
    const g = aggregateGroundedFields([
      taskRow('livebench', 'language', 0.7),
    ], 'Anthropic')
    expect(g.taskFitness.summarise?.value).toBe(0.7)
    expect(g.taskFitness.generate?.value).toBe(0.7)
  })

  it('ignores categories not in CATEGORY_TO_TASKS', () => {
    const g = aggregateGroundedFields([
      taskRow('artificialanalysis', 'unknown_metric', 0.99),
      taskRow('lmarena', 'coding', 0.5),
    ], 'Anthropic')
    expect(g.taskFitness.code?.value).toBe(0.5)
    expect(Object.keys(g.taskFitness)).toEqual(['code'])
  })

  it('returns empty taskFitness for empty input', () => {
    const g = aggregateGroundedFields([], 'Anthropic')
    expect(g.taskFitness).toEqual({})
  })
})

describe('aggregateGroundedFields — speed and latency', () => {
  it('averages aa_speed rows into speedScore', () => {
    const g = aggregateGroundedFields([speedRow(0.4), speedRow(0.6)], 'Anthropic')
    expect(g.speedScore?.value).toBe(0.5)
    expect(g.speedScore?.provenance).toBe('benchmark')
  })

  it('returns null speedScore when no speed rows are present', () => {
    const g = aggregateGroundedFields([taskRow('lmarena', 'coding', 0.5)], 'Anthropic')
    expect(g.speedScore).toBeNull()
  })

  it('drops latency rows entirely (not consumed in v1)', () => {
    const g = aggregateGroundedFields([latencyRow(0.9), speedRow(0.5)], 'Anthropic')
    expect(g.speedScore?.value).toBe(0.5)
    expect(Object.keys(g.taskFitness)).toEqual([])
  })
})

describe('aggregateGroundedFields — code capability threshold', () => {
  it('threshold sits at 0.5 (per CODE_CAPABILITY_THRESHOLD)', () => {
    expect(CODE_CAPABILITY_THRESHOLD).toBe(0.5)
    const high = aggregateGroundedFields([taskRow('lmarena', 'coding', 0.7)], 'Anthropic')
    expect(high.taskFitness.code!.value).toBeGreaterThanOrEqual(CODE_CAPABILITY_THRESHOLD)
    const low = aggregateGroundedFields([taskRow('lmarena', 'coding', 0.3)], 'Anthropic')
    expect(low.taskFitness.code!.value).toBeLessThan(CODE_CAPABILITY_THRESHOLD)
  })
})

describe('aggregateGroundedFields — evidence list for Haiku prompt', () => {
  it('includes one line per task row plus speed rows with raw tok/s', () => {
    const g = aggregateGroundedFields([
      taskRow('lmarena', 'coding', 0.6),
      speedRow(0.4, 180),
    ], 'Anthropic')
    expect(g.evidenceForPrompt).toContain('lmarena::coding = 0.60')
    expect(g.evidenceForPrompt).toContain('artificialanalysis::aa_speed = 0.40 (raw 180 tok/s)')
  })
})
