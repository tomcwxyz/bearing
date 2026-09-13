import { describe, expect, it } from 'vitest'
import { evaluateGoldenCorpus } from '@/evaluation/golden-evaluation'
import { GOLDEN_TASKS } from '@/evaluation/golden-tasks'
import { compareShadowRankings, withBenchmarkBlend } from '@/evaluation/shadow-ranking'
import { ALL_TASK_TYPES } from '../registry'

describe('golden task corpus', () => {
  it('covers every canonical task type', () => {
    const covered = new Set(GOLDEN_TASKS.map((task) => task.classification.taskType))
    for (const taskType of ALL_TASK_TYPES) {
      expect(covered.has(taskType), `missing golden task type: ${taskType}`).toBe(true)
    }
  })

  it('covers the main ranking hard gates and policy extremes', () => {
    const classifications = GOLDEN_TASKS.map((task) => task.classification)
    expect(classifications.some((task) => task.needsVision)).toBe(true)
    expect(classifications.some((task) => task.needsTools)).toBe(true)
    expect(classifications.some((task) => task.needsCode)).toBe(true)
    expect(classifications.some((task) => task.needsLongContext)).toBe(true)
    expect(classifications.some((task) => task.needsMultilingual)).toBe(true)
    expect(classifications.some((task) => task.isAgentic)).toBe(true)
    expect(classifications.some((task) => task.dataSensitivity === 'on_prem_required')).toBe(true)
    expect(classifications.some((task) => task.dataSensitivity === 'regulated_health')).toBe(true)
    expect(classifications.some((task) => task.dataSensitivity === 'regulated_finance')).toBe(true)
    expect(classifications.some((task) => task.latencyTarget === 'realtime')).toBe(true)
    expect(classifications.some((task) => task.volume === 'millions_per_day')).toBe(true)
  })

  it('passes production hard-filter and ranking invariants', () => {
    const evaluations = withBenchmarkBlend(0, () => evaluateGoldenCorpus(GOLDEN_TASKS))
    const failures = evaluations
      .filter((evaluation) => evaluation.issues.length > 0)
      .map((evaluation) => `${evaluation.id}: ${evaluation.issues.join(', ')}`)

    expect(failures).toEqual([])
  })
})

describe('shadow ranking comparison', () => {
  it('reports identical runs as unchanged', () => {
    const baseline = withBenchmarkBlend(0, () => evaluateGoldenCorpus(GOLDEN_TASKS))
    const report = compareShadowRankings(baseline, baseline)

    expect(report.changedTopCount).toBe(0)
    expect(report.highImpactCount).toBe(0)
    expect(report.unchangedCount).toBe(GOLDEN_TASKS.length)
  })

  it('treats a changed top recommendation as at least medium impact', () => {
    const baseline = withBenchmarkBlend(0, () => evaluateGoldenCorpus(GOLDEN_TASKS.slice(0, 1)))
    const [first] = baseline
    expect(first.models.length).toBeGreaterThan(1)

    const candidate = [{
      ...first,
      top: first.models[1].slug,
      top3: [first.models[1].slug, first.models[0].slug, ...first.top3.slice(2)],
      models: [first.models[1], first.models[0], ...first.models.slice(2)],
    }]

    const report = compareShadowRankings(baseline, candidate)
    expect(report.changedTopCount).toBe(1)
    expect(['medium', 'high']).toContain(report.changes[0].impact)
  })

  it('restores BENCHMARK_BLEND after a shadow pass', () => {
    process.env.BENCHMARK_BLEND = '0.17'
    const value = withBenchmarkBlend(0.4, () => process.env.BENCHMARK_BLEND)

    expect(value).toBe('0.4')
    expect(process.env.BENCHMARK_BLEND).toBe('0.17')
    delete process.env.BENCHMARK_BLEND
  })
})
