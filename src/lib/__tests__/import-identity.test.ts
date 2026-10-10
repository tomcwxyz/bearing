import { describe, expect, it } from 'vitest'
import { findImportConflicts } from '../import-identity'

const existing = [{
  slug: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic',
  openrouterId: 'anthropic/claude-sonnet-4', providerModelId: 'claude-sonnet-4-20250514',
  active: false,
}]

describe('import identity safeguards', () => {
  it('blocks a duplicate slug even when the model is an inactive draft', () => {
    expect(findImportConflicts({ slug: existing[0].slug, name: 'Different', provider: 'Other' }, existing)[0].kind).toBe('exact')
  })
  it('recognises the same OpenRouter ID with a different slug', () => {
    expect(findImportConflicts({ slug: 'other', name: 'Other', provider: 'Anthropic', openrouterId: existing[0].openrouterId }, existing)[0].reason).toBe('Same OpenRouter identifier')
  })
  it('recognises provider-native IDs', () => {
    expect(findImportConflicts({ slug: 'other', name: 'Other', provider: 'Anthropic', providerModelId: existing[0].providerModelId }, existing)[0].reason).toBe('Same provider identifier')
  })
  it('flags same provider and display name', () => {
    expect(findImportConflicts({ slug: 'other', name: existing[0].name, provider: existing[0].provider }, existing)).toHaveLength(1)
  })
  it('does not confuse distinct generations', () => {
    expect(findImportConflicts({ slug: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'Anthropic' }, existing)).toHaveLength(0)
  })
})
