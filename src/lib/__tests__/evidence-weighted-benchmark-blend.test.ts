import { afterEach, describe, expect, it } from 'vitest'

import type { BenchmarkAggregate, BenchmarkScoreMap } from '../benchmark-evidence'
import type { Factor } from '../registry'
import { scoreModels } from '../scoring'

const priorityOrder: Factor[] = [
  'quality',
  'capability',
  'cost',
  'speed',
  'privacy',
  'transparency',
  'sustainability',
]

const baseInput = {
  taskType: 'code',
  complexity: 'moderate',
  inputLength: 'medium',
  needsVision: false,
  needsTools: false,
  needsCode: true,
  priorityOrder,
}

function evidenceMap(
  key: string,
  score: number,
  aggregate: BenchmarkAggregate,
): BenchmarkScoreMap {
  const map = new Map<string, number>([[key, score]]) as BenchmarkScoreMap
  map.aggregates = new Map([[key, aggregate]])
  return map
}

afterEach(() => {
  delete process.env.BENCHMARK_BLEND
})

describe('evidence-weighted benchmark blending', () => {
  it('lets strong fresh benchmark evidence influence quality even when disagreement is large', () => {
    process.env.BENCHMARK_BLEND = '0.5'
    const key = 'claude-sonnet-4.6::code'
    const baseline = scoreModels(baseInput).find((model) => model.slug === 'claude-sonnet-4.6')!
    const benchmarkScore = 0.20
    const benchmarkScores = evidenceMap(key, benchmarkScore, {
      score: benchmarkScore,
      sourceCount: 3,
      categoryCount: 4,
      latestSnapshot: '2099-01-01',
      totalVotes: 5000,
    })

    const result = scoreModels({ ...baseInput, benchmarkScores })
      .find((model) => model.slug === 'claude-sonnet-4.6')!

    expect(Math.abs(baseline.factorScores.quality - benchmarkScore)).toBeGreaterThan(0.10)
    expect(result.factorScores.quality).toBeCloseTo(
      baseline.factorScores.quality * 0.5 + benchmarkScore * 0.5,
      5,
    )
    expect(result.factorScores.quality).toBeLessThan(baseline.factorScores.quality)
  })

  it('gives stale evidence only part of the configured blend', () => {
    process.env.BENCHMARK_BLEND = '0.5'
    const key = 'claude-sonnet-4.6::code'
    const baseline = scoreModels(baseInput).find((model) => model.slug === 'claude-sonnet-4.6')!
    const benchmarkScore = 0.20
    const benchmarkScores = evidenceMap(key, benchmarkScore, {
      score: benchmarkScore,
      sourceCount: 3,
      categoryCount: 4,
      latestSnapshot: '2020-01-01',
      totalVotes: 5000,
    })

    const result = scoreModels({ ...baseInput, benchmarkScores })
      .find((model) => model.slug === 'claude-sonnet-4.6')!

    const effectiveBlend = 0.5 * 0.30
    expect(result.factorScores.quality).toBeCloseTo(
      baseline.factorScores.quality * (1 - effectiveBlend) + benchmarkScore * effectiveBlend,
      5,
    )
  })
})
