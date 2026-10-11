import { describe, it, expect } from 'vitest'
import { combineCatalogueObservations } from '@/lib/combine-catalogue-observations'
import type { VerificationObservation } from '@/db/model-verification'

const time = '2026-10-11T07:00:00.000Z'
const current: VerificationObservation = { slug: 'model', source: 'openrouter', status: 'current', note: null, verifiedAt: time }
const nativeMissing: VerificationObservation = { slug: 'model', source: 'provider:example', status: 'unavailable', note: 'Native identifier missing.', verifiedAt: time }

describe('multi-source verification decisions', () => {
  it('does not call a model wholly unavailable while an alternate route is current', () => {
    const combined = combineCatalogueObservations([current], [nativeMissing])
    expect(combined).toMatchObject([{
      status: 'attention', source: 'provider:example',
    }])
    expect(combined[0].note).toContain('OpenRouter still lists')
    expect(nativeMissing.status).toBe('unavailable')
  })
  it('retains native absence when no alternative has been confirmed', () => {
    expect(combineCatalogueObservations([], [nativeMissing])[0].status).toBe('unavailable')
  })
  it('prefers a successful provider-native observation', () => {
    expect(combineCatalogueObservations([current], [{ ...nativeMissing, status: 'current' }])[0].source).toBe('provider:example')
  })
  it('preserves models only observed on OpenRouter', () => {
    expect(combineCatalogueObservations([current], [])).toEqual([current])
  })
})
