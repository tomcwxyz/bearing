import { describe, expect, it } from 'vitest'

import { originalRecommendationRank } from './route-metadata'

describe('originalRecommendationRank', () => {
  const ranked = [
    { slug: 'model-a' },
    { slug: 'model-b' },
    { slug: 'model-c' },
  ]

  it('records the selected model original recommendation rank', () => {
    expect(originalRecommendationRank(ranked, 'model-a')).toBe(1)
    expect(originalRecommendationRank(ranked, 'model-c')).toBe(3)
  })

  it('falls back to rank one if the selected slug is unexpectedly absent', () => {
    expect(originalRecommendationRank(ranked, 'missing-model')).toBe(1)
  })
})
