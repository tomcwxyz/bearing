import { describe, expect, it } from 'vitest'
import { selectModelsForVerification, verificationCoverage } from '@/lib/verification-scope'
import type { ModelForVerification, VerificationObservation } from '@/db/model-verification'

function model(slug: string, active: boolean, openrouterId: string | null = null, providerModelId: string | null = null): ModelForVerification {
  return {
    slug, name: slug, provider: 'Example', active, openrouterId, providerModelId,
    pricing: { input_per_1m: 1, output_per_1m: 1 }, contextWindow: 1000,
    capabilities: [], last_verified_at: null, verification_status: 'unknown',
    verification_source: null, verification_note: null,
  }
}

describe('live catalogue verification scope', () => {
  const models = [
    model('live-a', true, 'example/live-a'),
    model('live-b', true, null, 'native/live-b'),
    model('live-unmapped', true),
    model('draft-a', false, 'example/draft-a'),
  ]

  it('weekly and verify-all checks include live models, never drafts', () => {
    expect(selectModelsForVerification(models).map(m => m.slug)).toEqual([
      'live-a', 'live-b', 'live-unmapped',
    ])
  })

  it('selected-draft checks remain possible without pulling in live models', () => {
    expect(selectModelsForVerification(models, ['draft-a']).map(m => m.slug)).toEqual(['draft-a'])
    expect(selectModelsForVerification(models, []).map(m => m.slug)).toEqual([])
  })

  it('tracks unverified coverage separately from provider assertions', () => {
    const observations: VerificationObservation[] = [{
      slug: 'live-a', status: 'current', source: 'openrouter', note: null,
      verifiedAt: '2026-10-11T07:00:00.000Z',
    }]
    expect(verificationCoverage(selectModelsForVerification(models), observations)).toEqual({
      targeted: 3,
      unmapped: 1,
      unverifiedModels: [
        { slug: 'live-b', reason: 'source_not_checked' },
        { slug: 'live-unmapped', reason: 'no_catalogue_id' },
      ],
    })
  })
})
