import { describe, expect, it } from 'vitest'
import { assessDiscoverCoverage, isStaleSnapshot, type SourceBenchmarkName } from '../discover-coverage'

const snapshot = (source: SourceBenchmarkName['source'], sourceModelName: string): SourceBenchmarkName => ({
  source, sourceModelName, latestSnapshot: '2026-10-08',
  lastCapturedAt: '2026-10-09', qualityCategories: 7,
})

describe('full Discover benchmark audit', () => {
  const models = [
    { id: 'anthropic/claude-haiku-4.5', name: 'Anthropic: Claude Haiku 4.5', provider: 'Anthropic' },
    { id: 'openai/gpt-5.6-sol', name: 'OpenAI: GPT-5.6 Sol', provider: 'OpenAI' },
    { id: 'anthropic/claude-haiku-5.5', name: 'Anthropic: Claude Haiku 5.5', provider: 'Anthropic' },
    { id: 'moonshotai/kimi-k3', name: 'MoonshotAI: Kimi K3', provider: 'Moonshot' },
  ]

  it('keeps variants in review and cannot mistake Sol high for another variant', () => {
    const result = assessDiscoverCoverage(models, [
      snapshot('artificialanalysis', 'GPT-5.6 Sol (high)'),
      snapshot('artificialanalysis', 'GPT-5.6 Sol (low)'),
      snapshot('lmarena', 'gpt-5.6-sol-xhigh'),
    ], new Date('2026-10-09'))
    expect(result['openai/gpt-5.6-sol'].status).toBe('review')
    expect(result['openai/gpt-5.6-sol'].sources[0].status).toBe('review')
    expect(result['openai/gpt-5.6-sol'].sources[1].flags.length).toBeGreaterThan(0)
    expect(result['anthropic/claude-haiku-5.5'].status).toBe('none')
  })

  it('recognises likely unqualified candidates but does not claim an approved alias', () => {
    const result = assessDiscoverCoverage(models, [
      snapshot('artificialanalysis', 'Claude Haiku 4.5'),
      snapshot('lmarena', 'Kimi K3'),
    ], new Date('2026-10-09'))
    expect(result['anthropic/claude-haiku-4.5'].status).toBe('candidate')
    expect(result['moonshotai/kimi-k3'].status).toBe('candidate')
  })

  it('uses the source snapshot date, not last fetch date, for freshness', () => {
    expect(isStaleSnapshot('2026-07-29', new Date('2026-10-09'))).toBe(true)
    expect(isStaleSnapshot('2026-10-01', new Date('2026-10-09'))).toBe(false)
  })
})


describe('OpenRouter Mistral version suffix', () => {
  it('lists Mistral Large 4 Preview as a candidate for manual review', () => {
    const result = assessDiscoverCoverage([
      { id: 'mistralai/mistral-large-4-0', name: 'Mistral: Mistral Large 4', provider: 'Mistral' },
    ], [snapshot('artificialanalysis', 'Mistral Large 4 Preview')], new Date('2026-10-09'))
    expect(result['mistralai/mistral-large-4-0'].sources[1].status).toBe('review')
    expect(result['mistralai/mistral-large-4-0'].sources[1].sourceModelName).toBe('Mistral Large 4 Preview')
  })
})
