import type { AdminModel } from '@/db/models'

export interface DraftPublishMeta {
  slug: string
  openrouterId: string | null
  providerModelId: string | null
  verificationStatus: string | null
  benchmarkSources: string[]
}
export interface DraftReadiness {
  blockers: string[]
  warnings: string[]
  ready: boolean
}

/** Editorial warnings are not the same as broken model configuration.
 * Do not force a benchmark mapping merely to get a model published. */
export function assessDraftReadiness(
  model: Pick<AdminModel, 'name' | 'provider' | 'tier' | 'context_window' |
    'pricing' | 'task_fitness' | 'speed_score' | 'privacy_score' | 'capabilities' |
    'model_class'>,
  meta: DraftPublishMeta,
): DraftReadiness {
  const blockers: string[] = []
  const warnings: string[] = []
  if (!model.name?.trim() || !model.provider?.trim() || !model.tier?.trim()) {
    blockers.push('Name, provider and tier are required')
  }
  if (!Number.isFinite(model.context_window) || model.context_window <= 0) {
    blockers.push('Context window must be a positive number')
  }
  const prices = [model.pricing?.input_per_1m, model.pricing?.output_per_1m]
  if (prices.some(price => !Number.isFinite(price) || price < 0)) {
    blockers.push('Pricing must contain valid non-negative values')
  }
  if ([model.speed_score, model.privacy_score].some(v => !Number.isFinite(v) || v < 0 || v > 1)) {
    blockers.push('Speed and privacy scores must be between 0 and 1')
  }
  const taskScores = Object.values(model.task_fitness ?? {})
  if (taskScores.some(score => !Number.isFinite(score) || score < 0 || score > 1)) {
    blockers.push('Task scores must be between 0 and 1')
  }
  if (taskScores.length === 0) warnings.push('No task scores yet')
  if (!meta.benchmarkSources.length) warnings.push('No approved benchmark mapping')
  if (!meta.openrouterId && !meta.providerModelId) warnings.push('No model routing identifier')
  if (meta.verificationStatus === 'unavailable') {
    warnings.push('Catalogue verification reports unavailable')
  } else if (!meta.verificationStatus || meta.verificationStatus === 'unknown') {
    warnings.push('Catalogue has not been verified')
  }
  if ((model.capabilities ?? []).length === 0) warnings.push('No capabilities listed')
  return { blockers, warnings, ready: blockers.length === 0 }
}
