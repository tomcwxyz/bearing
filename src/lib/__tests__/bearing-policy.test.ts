import { describe, expect, it } from 'vitest'
import {
  deriveBearingPriorities,
  describeBearing,
  nudgePriorityOrder,
} from '../bearing-policy'

function rankOf(order: string[], factor: string) {
  return order.indexOf(factor)
}

describe('deriveBearingPriorities', () => {
  it('keeps quality and capability first for a normal moderate task', () => {
    const order = deriveBearingPriorities({
      task_type: 'generate',
      complexity: 'moderate',
      data_sensitivity: 'none',
      latency_target: 'interactive',
      volume: 'one_off',
    })

    expect(order.slice(0, 2)).toEqual(['quality', 'capability'])
    expect(new Set(order).size).toBe(7)
    expect(order).toHaveLength(7)
  })

  it('raises privacy to the top for regulated data', () => {
    const order = deriveBearingPriorities({
      complexity: 'moderate',
      data_sensitivity: 'regulated_health',
      latency_target: 'interactive',
      volume: 'one_off',
    })

    expect(order[0]).toBe('privacy')
    expect(rankOf(order, 'transparency')).toBeLessThan(rankOf(order, 'sustainability'))
  })

  it('raises speed for realtime work', () => {
    const order = deriveBearingPriorities({
      complexity: 'simple',
      data_sensitivity: 'none',
      latency_target: 'realtime',
      volume: 'one_off',
    })

    expect(rankOf(order, 'speed')).toBeLessThan(rankOf(order, 'cost'))
    expect(order.slice(0, 3)).toContain('speed')
  })

  it('raises cost for very high-volume work', () => {
    const order = deriveBearingPriorities({
      complexity: 'simple',
      data_sensitivity: 'none',
      latency_target: 'batch',
      volume: 'millions_per_day',
    })

    expect(order[0]).toBe('cost')
    expect(rankOf(order, 'cost')).toBeLessThan(rankOf(order, 'quality'))
  })

  it('keeps capability near the top when the task needs specialist features', () => {
    const order = deriveBearingPriorities({
      complexity: 'complex',
      needs_tools: true,
      is_agentic: true,
      needs_reasoning: true,
      data_sensitivity: 'none',
      latency_target: 'interactive',
      volume: 'one_off',
    })

    expect(order.slice(0, 2)).toEqual(['quality', 'capability'])
  })

  it('raises cost for embedding workloads without losing class-relevant capability', () => {
    const order = deriveBearingPriorities({
      task_type: 'embedding',
      complexity: 'simple',
      data_sensitivity: 'none',
      latency_target: 'batch',
      volume: 'thousands_per_day',
    })

    expect(order.slice(0, 3)).toContain('cost')
    expect(order.slice(0, 3)).toContain('capability')
  })

  it('uses preferences as a soft nudge rather than replacing task evidence', () => {
    const neutral = deriveBearingPriorities({
      complexity: 'simple',
      data_sensitivity: 'none',
      latency_target: 'interactive',
      volume: 'one_off',
    })
    const privateByDefault = deriveBearingPriorities({
      complexity: 'simple',
      data_sensitivity: 'none',
      latency_target: 'interactive',
      volume: 'one_off',
    }, { preferredFactors: ['privacy'] })

    expect(neutral.slice(0, 3)).toEqual(['quality', 'capability', 'cost'])
    expect(privateByDefault.slice(0, 3)).toEqual(['quality', 'capability', 'privacy'])
  })

  it('does not let a cost preference overpower a realtime task signal', () => {
    const order = deriveBearingPriorities({
      complexity: 'simple',
      data_sensitivity: 'none',
      latency_target: 'realtime',
      volume: 'one_off',
    }, { preferredFactors: ['cost'] })

    expect(order[0]).toBe('speed')
    expect(rankOf(order, 'speed')).toBeLessThan(rankOf(order, 'cost'))
  })
})

describe('nudgePriorityOrder', () => {
  it('returns the same order when there are no preferences', () => {
    const order = ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency'] as const
    expect(nudgePriorityOrder([...order])).toEqual(order)
  })

  it('moves a preferred factor modestly without rebuilding a specialised order', () => {
    const order = ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency'] as const
    const nudged = nudgePriorityOrder([...order], ['privacy'])

    expect(nudged.slice(0, 3)).toEqual(['quality', 'cost', 'speed'])
    expect(rankOf(nudged, 'privacy')).toBeLessThan(rankOf(nudged, 'capability'))
  })
})

describe('describeBearing', () => {
  it('summarises the top three priorities in plain language', () => {
    expect(describeBearing(['privacy', 'quality', 'capability', 'cost', 'speed', 'transparency', 'sustainability']))
      .toBe('Bearing prioritised privacy, quality and capability for this task.')
  })
})
