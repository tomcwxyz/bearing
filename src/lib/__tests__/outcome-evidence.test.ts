import { describe, expect, it } from 'vitest'
import { outcomeInformationScarcity, summariseOutcomeEvidence } from '../outcome-evidence'

describe('summariseOutcomeEvidence', () => {
  it('keeps an empty human sample explicitly unproven', () => {
    const evidence = summariseOutcomeEvidence({
      humanPositive: 0,
      humanNegative: 0,
      humanTies: 0,
      judgePositive: 0,
      judgeNegative: 0,
    }, 'task_type+complexity')

    expect(evidence.level).toBe('none')
    expect(evidence.humanPositiveShare).toBeNull()
    expect(evidence.label).toBe('Outcome evidence: none yet')
  })

  it('labels small human samples as early evidence', () => {
    const evidence = summariseOutcomeEvidence({
      humanPositive: 2,
      humanNegative: 1,
      humanTies: 1,
      judgePositive: 0,
      judgeNegative: 0,
    }, 'task_type')

    expect(evidence.level).toBe('early')
    expect(evidence.humanSupport).toBe(4)
    expect(evidence.humanPositiveShare).toBeCloseTo(0.625, 6)
  })

  it('requires five human signals before calling outcome evidence supported', () => {
    const evidence = summariseOutcomeEvidence({
      humanPositive: 4,
      humanNegative: 1,
      humanTies: 0,
      judgePositive: 3,
      judgeNegative: 1,
    }, 'task_type+complexity')

    expect(evidence.level).toBe('supported')
    expect(evidence.humanSupport).toBe(5)
    expect(evidence.humanPositiveShare).toBeCloseTo(0.8, 6)
    expect(evidence.judgeSupport).toBe(4)
    expect(evidence.judgePositiveShare).toBeCloseTo(0.75, 6)
  })

  it('does not promote machine judge evidence into human support', () => {
    const evidence = summariseOutcomeEvidence({
      humanPositive: 0,
      humanNegative: 0,
      humanTies: 0,
      judgePositive: 8,
      judgeNegative: 2,
    }, 'task_type')

    expect(evidence.level).toBe('none')
    expect(evidence.humanSupport).toBe(0)
    expect(evidence.judgeSupport).toBe(10)
    expect(evidence.label).toBe('Outcome evidence: machine-only')
  })
})

describe('outcomeInformationScarcity', () => {
  it('is highest with no evidence and falls as human support grows', () => {
    expect(outcomeInformationScarcity(null)).toBe(1)

    const early = summariseOutcomeEvidence({
      humanPositive: 2,
      humanNegative: 0,
      humanTies: 0,
      judgePositive: 10,
      judgeNegative: 0,
    }, 'task_type')
    const established = summariseOutcomeEvidence({
      humanPositive: 8,
      humanNegative: 0,
      humanTies: 0,
      judgePositive: 0,
      judgeNegative: 0,
    }, 'task_type')

    expect(outcomeInformationScarcity(early)).toBeCloseTo(0.75, 6)
    expect(outcomeInformationScarcity(established)).toBe(0)
  })
})
