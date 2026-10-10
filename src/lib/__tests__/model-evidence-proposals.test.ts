import { describe, expect, it } from 'vitest'
import { validateEvidenceProposal } from '../model-evidence-proposals'
import { isEvidenceProposalCurrent } from '../model-evidence-current'
import { getAllModels } from '../registry'

const example = {
  schema_version: 1, id: 'context-example-2026', model_slug: 'fictional-model',
  field: 'context_window', expected: 8192, proposed: 16384,
  rationale: 'Current catalogue differs from the published provider documentation.',
  evidence: {
    url: 'https://example.org/model-documentation',
    title: 'Official model documentation',
    claim: 'The provider explicitly lists a longer context window for this revision.',
    observed_on: '2026-10-09',
  },
}

describe('public model evidence proposals', () => {
  it('accepts a properly cited correction', () => {
    expect(validateEvidenceProposal(example).proposed).toBe(16384)
  })
  it('rejects unexpected keys and unsafe URLs', () => {
    expect(() => validateEvidenceProposal({ ...example, admin: true })).toThrow()
    expect(() => validateEvidenceProposal({ ...example,
      evidence: { ...example.evidence, url: 'http://example.org/' } })).toThrow()
    expect(() => validateEvidenceProposal({ ...example,
      evidence: { ...example.evidence, url: 'https://user:pass@example.org/' } })).toThrow()
  })
  it('enforces canonical IDs and field paths', () => {
    expect(() => validateEvidenceProposal({ ...example, id: '../../anything' })).toThrow()
    expect(() => validateEvidenceProposal({ ...example, field: 'active' })).toThrow()
    expect(() => validateEvidenceProposal({ ...example, field: 'provider_model_id' })).toThrow()
  })
  it('requires meaningful changes and safe values', () => {
    expect(() => validateEvidenceProposal({ ...example, proposed: 8192 })).toThrow()
    expect(() => validateEvidenceProposal({ ...example, proposed: Number.POSITIVE_INFINITY })).toThrow()
    expect(() => validateEvidenceProposal({ ...example, proposed: -1 })).toThrow()
    expect(() => validateEvidenceProposal({ ...example, field: 'capabilities', expected: [], proposed: ['hacking'] })).toThrow()
  })
  it('does not allow unsourced task-fitness changes', () => {
    const change={ ...example, field: 'task_fitness.research', expected: 0.5, proposed: 0.8 }
    expect(() => validateEvidenceProposal(change)).toThrow()
    expect(validateEvidenceProposal({
      ...change,
      evaluation: 'Replay representative golden tasks and inspect top-three ranking changes before rollout.',
      evidence: { ...example.evidence, variant: 'fictional-model-release-2026' },
    }).proposed).toBe(0.8)
  })
  it('recognises current values and blocks stale changes before review', () => {
    const model = getAllModels()[0]
    expect(isEvidenceProposalCurrent(model, {
      field: 'context_window', expected: model.context_window,
    })).toBe(true)
    expect(isEvidenceProposalCurrent(model, {
      field: 'context_window', expected: model.context_window + 1,
    })).toBe(false)
    expect(isEvidenceProposalCurrent(null, { field: 'name', expected: model.name })).toBe(false)
  })
  it('requires a genuine calendar date and a rationale', () => {
    expect(() => validateEvidenceProposal({ ...example, evidence: { ...example.evidence, observed_on: '2026-02-31' } })).toThrow()
    expect(() => validateEvidenceProposal({ ...example, rationale: 'yes' })).toThrow()
  })
})
