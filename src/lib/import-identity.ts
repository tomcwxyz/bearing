import { compareModelIdentity } from './model-identity'

export interface ImportIdentity {
  slug: string
  name: string
  provider: string
  openrouterId?: string | null
  providerModelId?: string | null
  active?: boolean
}
export interface ImportConflict {
  slug: string
  name: string
  reason: string
  kind: 'exact' | 'possible'
}
export function findImportConflicts(candidate: ImportIdentity, existing: ImportIdentity[]): ImportConflict[] {
  const conflicts: ImportConflict[] = []
  for (const model of existing) {
    let reason: string | null = null
    let kind: ImportConflict['kind'] = 'exact'
    if (candidate.slug === model.slug) reason = 'Same registry slug'
    else if (candidate.openrouterId && model.openrouterId &&
      candidate.openrouterId.toLowerCase() === model.openrouterId.toLowerCase()) reason = 'Same OpenRouter identifier'
    else if (candidate.providerModelId && model.providerModelId &&
      candidate.provider.toLowerCase() === model.provider.toLowerCase() &&
      candidate.providerModelId.toLowerCase() === model.providerModelId.toLowerCase()) reason = 'Same provider identifier'
    else {
      const assessment = compareModelIdentity(candidate, model)
      if (assessment) {
        kind = 'possible'
        reason = assessment.autoEligible ? 'Matching model identity' : `Similar identity: ${assessment.flags.join(', ') || 'review required'}`
      }
      // Identity reconciliation is intentionally cautious: exact same provider/name
      // is a possible duplicate even for families the matcher does not recognise.
      if (!reason && candidate.provider.toLowerCase() === model.provider.toLowerCase() &&
        candidate.name.trim().toLowerCase() === model.name.trim().toLowerCase()) {
        kind = 'possible'
        reason = 'Same provider and display name'
      }
    }
    if (reason) conflicts.push({ slug: model.slug, name: model.name, reason, kind })
  }
  return conflicts.sort((a, b) => Number(b.kind === 'exact') - Number(a.kind === 'exact'))
}
