import { describe, expect, it } from 'vitest'
import { modelLifecycleStatus, validateLifecycleReason, validateLifecycleSlugs } from '@/lib/model-lifecycle'

describe('model lifecycle', () => {
  it('shows drafts and retired models separately while both remain inactive', () => {
    expect(modelLifecycleStatus(false, null)).toBe('draft')
    expect(modelLifecycleStatus(false, '2026-10-11T10:00:00Z')).toBe('retired')
    expect(modelLifecycleStatus(true, null)).toBe('live')
  })
  it('rejects empty or invalid bulk selections and deduplicates IDs', () => {
    expect(() => validateLifecycleSlugs([])).toThrow()
    expect(() => validateLifecycleSlugs(['../../bad'])).toThrow()
    expect(() => validateLifecycleSlugs(Array(101).fill('test'))).toThrow()
    expect(validateLifecycleSlugs(['one', 'one', 'two'])).toEqual(['one', 'two'])
  })
  it('requires an auditable reason', () => {
    expect(() => validateLifecycleReason(' ')).toThrow()
    expect(validateLifecycleReason('  Provider has withdrawn the model  ')).toBe('Provider has withdrawn the model')
  })
})
