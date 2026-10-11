import type { ModelForVerification, VerificationObservation } from '@/db/model-verification'

/**
 * Scheduled and full-catalogue checks target only live models.
 * Explicit selections can contain drafts (the publishing queue validates them).
 */
export function selectModelsForVerification(
  models: ModelForVerification[],
  selectedSlugs?: string[],
): ModelForVerification[] {
  if (selectedSlugs === undefined) return models.filter(model => model.active)
  const selected = new Set(selectedSlugs)
  return models.filter(model => selected.has(model.slug))
}

export type UnverifiedModel = {
  slug: string
  reason: 'no_catalogue_id' | 'source_not_checked'
}

/** An unobserved model is never represented as verified or unavailable. */
export function verificationCoverage(
  models: ModelForVerification[],
  observations: VerificationObservation[],
): { targeted: number; unmapped: number; unverifiedModels: UnverifiedModel[] } {
  const observed = new Set(observations.map(item => item.slug))
  return {
    targeted: models.length,
    unmapped: models.filter(model => !model.openrouterId && !model.providerModelId).length,
    unverifiedModels: models
      .filter(model => !observed.has(model.slug))
      .map(model => ({
        slug: model.slug,
        reason: (!model.openrouterId && !model.providerModelId)
          ? 'no_catalogue_id' as const : 'source_not_checked' as const,
      })),
  }
}
