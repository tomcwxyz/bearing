import { listModelsForVerification, saveVerificationObservations, type VerificationObservation } from '@/db/model-verification'
import { assessOpenRouterCatalogue, type CatalogueVerificationReport } from './catalogue-verification'
import { fetchOpenRouterModels } from './openrouter'
import {
  assessProviderCatalogue,
  fetchProviderCatalogues,
  type ProviderVerificationReport,
} from './provider-catalogue'

export interface CatalogueVerificationRunReport extends CatalogueVerificationReport {
  providerReports: Array<Omit<ProviderVerificationReport, 'observations'>>
  skippedProviders: { provider: string; reason: string }[]
  providerFailures: { provider: string; error: string }[]
  openRouterFailure: string | null
}

function observationCounts(observations: VerificationObservation[]) {
  return {
    current: observations.filter((o) => o.status === 'current').length,
    attention: observations.filter((o) => o.status === 'attention').length,
    unavailable: observations.filter((o) => o.status === 'unavailable').length,
  }
}

/**
 * Shared implementation for the admin button and scheduled catalogue check.
 *
 * Provider-native evidence wins when an explicit provider id is mapped and
 * that provider's catalogue request succeeds. OpenRouter remains the broad
 * fallback. A source failure never becomes an `unavailable` observation.
 */
export async function runCatalogueVerification(): Promise<CatalogueVerificationRunReport> {
  const models = await listModelsForVerification()

  const [providerFetch, openRouterAttempt] = await Promise.all([
    fetchProviderCatalogues(),
    fetchOpenRouterModels()
      .then((openRouterModels) => ({
        report: assessOpenRouterCatalogue(models, openRouterModels),
        error: null as string | null,
      }))
      .catch((error: unknown) => ({
        report: null,
        error: error instanceof Error ? error.message : 'OpenRouter catalogue request failed',
      })),
  ])

  const providerReports = providerFetch.snapshots.map((snapshot) =>
    assessProviderCatalogue(models, snapshot),
  )

  // Start with broad OpenRouter evidence, then let successful provider-native
  // observations replace it for explicitly mapped models.
  const chosen = new Map<string, VerificationObservation>()
  for (const observation of openRouterAttempt.report?.observations ?? []) {
    chosen.set(observation.slug, observation)
  }
  for (const report of providerReports) {
    for (const observation of report.observations) {
      chosen.set(observation.slug, observation)
    }
  }

  const observations = [...chosen.values()]
  if (observations.length === 0 && openRouterAttempt.error && providerFetch.snapshots.length === 0) {
    throw new Error(`No catalogue source could be verified. OpenRouter: ${openRouterAttempt.error}`)
  }

  await saveVerificationObservations(observations)

  const counts = observationCounts(observations)
  const activeCount = models.filter((model) => model.active).length

  return {
    checked: observations.length,
    current: counts.current,
    attention: counts.attention,
    unavailable: counts.unavailable,
    unmapped: Math.max(0, activeCount - observations.length),
    newCandidates: openRouterAttempt.report?.newCandidates ?? 0,
    observations,
    providerReports: providerReports.map(({ observations: _observations, ...report }) => report),
    skippedProviders: providerFetch.skipped,
    providerFailures: providerFetch.failures,
    openRouterFailure: openRouterAttempt.error,
  }
}

/** Backwards-compatible name for existing admin/API callers. */
export async function runOpenRouterCatalogueVerification(): Promise<CatalogueVerificationRunReport> {
  return runCatalogueVerification()
}
