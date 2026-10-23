import { describe, expect, it } from 'vitest'
import { validateFeedback } from '../community-feedback'

describe('community feedback validation', () => {
  const base = {kind:'model_correction',modelSlug:'',description:'This model has a different documented context window.',evidenceUrl:''}
  it('accepts a useful report without GitHub or model slug', () => {
    expect(validateFeedback(base)).toMatchObject({kind:'model_correction',modelSlug:null})
  })
  it('rejects unsupported report kinds', () => {
    expect(() => validateFeedback({...base,kind:'something_else'})).toThrow()
  })
  it('rejects dangerous or untrusted evidence schemes', () => {
    for (const evidenceUrl of ['http://example.org','javascript:alert(1)','https://name:password@example.org']) {
      expect(() => validateFeedback({...base,evidenceUrl})).toThrow()
    }
  })
  it('bounds descriptions and model slugs', () => {
    expect(() => validateFeedback({...base,description:'short'})).toThrow()
    expect(() => validateFeedback({...base,description:'x'.repeat(2501)})).toThrow()
    expect(() => validateFeedback({...base,modelSlug:'../../invalid'})).toThrow()
  })
})
