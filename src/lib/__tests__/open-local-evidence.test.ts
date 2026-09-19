import { describe, expect, it } from 'vitest'
import {
  REVIEWED_OPEN_LOCAL_EVIDENCE,
  getReviewedOpenLocalEvidence,
} from '../open-local-evidence'

describe('reviewed open/local evidence', () => {
  it('keeps reviewed slugs unique', () => {
    const slugs = REVIEWED_OPEN_LOCAL_EVIDENCE.map((entry) => entry.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('requires concrete local info for confirmed-local entries', () => {
    for (const entry of REVIEWED_OPEN_LOCAL_EVIDENCE) {
      if (entry.status === 'confirmed_local') {
        expect(entry.localInfo?.quant_options.length).toBeGreaterThan(0)
        expect(entry.sources.length).toBeGreaterThan(0)
      }
    }
  })

  it('records provider-only weight access explicitly', () => {
    expect(getReviewedOpenLocalEvidence('qwen3.6-plus')?.weightAccess).toBe('provider_only')
  })

  it('does not turn hosted-only or weights-only evidence into local capability', () => {
    expect(getReviewedOpenLocalEvidence('glm-5.2')?.localInfo).toBeUndefined()
    expect(getReviewedOpenLocalEvidence('kimi-k3')?.localInfo).toBeUndefined()
  })

  it('records source provenance and review dates', () => {
    for (const entry of REVIEWED_OPEN_LOCAL_EVIDENCE) {
      expect(entry.sources.length).toBeGreaterThan(0)
      for (const source of entry.sources) {
        expect(source.url).toMatch(/^https:\/\//)
        expect(source.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })
})
