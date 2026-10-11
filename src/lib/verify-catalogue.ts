import { combineCatalogueObservations } from './combine-catalogue-observations'
import { selectModelsForVerification, verificationCoverage, type UnverifiedModel } from './verification-scope'
import { recordAvailabilityObservations } from '@/db/model-retirement'
import { listModelsForVerification, saveVerificationObservations, type VerificationObservation } from '@/db/model-verification'
import { assessOpenRouterCatalogue, type CatalogueVerificationReport } from './catalogue-verification'
import { fetchOpenRouterModels } from './openrouter'
import {
  assessProviderCatalogue,
  fetchProviderCatalogues,
  type ProviderVerificationReport,
} from './provider-catalogue'
import { fetchReviewedOllamaCloudAvailability } from './ollama-cloud'

export interface CatalogueVerificationRunReport extends CatalogueVerificationReport {
  providerReports: Array<Omit<ProviderVerificationReport, 'observations'>>
  skippedProviders: { provider: string; reason: string }[]
  providerFailures: { provider: string; error: string }[]
  openRouterFailure: string | null
  targeted: number
  unverifiedModels: UnverifiedModel[]
  ollamaCloudRoutes: {
    checked: number
    current: number
    unavailable: number
    failure: string | null
    routes: Array<{
      slug: string
      modelId: string
      available: boolean
      matchedModelId: string | null
      pricingCheckedAt: string
    }>
  }
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
export async function runCatalogueVerification(selectedSlugs?: string[]): Promise<CatalogueVerificationRunReport> {
  const allModels = await listModelsForVerification()
  const models = selectModelsForVerification(allModels, selectedSlugs)

  const [providerFetch, openRouterAttempt, ollamaCloudAttempt] = await Promise.all([
    fetchProviderCatalogues(),
    fetchOpenRouterModels()
      .then((openRouterModels) => {
        if (openRouterModels.length === 0) throw new Error('OpenRouter returned an empty catalogue')
        return {
        report: assessOpenRouterCatalogue(models, openRouterModels),
        error: null as string | null,
        }
      })
      .catch((error: unknown) => ({
        report: null,
        error: error instanceof Error ? error.message : 'OpenRouter catalogue request failed',
      })),
    fetchReviewedOllamaCloudAvailability()
      .then((routes) => ({ routes, error: null as string | null }))
      .catch((error: unknown) => ({
        routes: [],
        error: error instanceof Error ? error.message : 'Ollama Cloud catalogue request failed',
      })),
  ])

  const providerReports = providerFetch.snapshots.map((snapshot) =>
    assessProviderCatalogue(models, snapshot),
  )

  // Retain independent availability evidence for every successful route.
  // Retirement review needs to see a healthy alternative route as well as
  // any missing provider-native ID.
  const openRouterObservations = openRouterAttempt.report?.observations ?? []
  const nativeObservations = providerReports.flatMap(report => report.observations)
  const observations = combineCatalogueObservations(openRouterObservations, nativeObservations)
  if (observations.length === 0 && openRouterAttempt.error && providerFetch.snapshots.length === 0) {
    throw new Error(`No catalogue source could be verified. OpenRouter: ${openRouterAttempt.error}`)
  }

  await saveVerificationObservations(observations)
  await recordAvailabilityObservations([...openRouterObservations, ...nativeObservations])

  const counts = observationCounts(observations)
  const coverage = verificationCoverage(models, observations)

  return {
    checked: observations.length,
    current: counts.current,
    attention: counts.attention,
    unavailable: counts.unavailable,
    unmapped: coverage.unmapped,
    targeted: coverage.targeted,
    unverifiedModels: coverage.unverifiedModels,
    newCandidates: openRouterAttempt.report?.newCandidates ?? 0,
    observations,
    providerReports: providerReports.map(({ observations: _observations, ...report }) => report),
    skippedProviders: providerFetch.skipped,
    providerFailures: providerFetch.failures,
    openRouterFailure: openRouterAttempt.error,
    ollamaCloudRoutes: {
      checked: ollamaCloudAttempt.routes.length,
      current: ollamaCloudAttempt.routes.filter((item) => item.available).length,
      unavailable: ollamaCloudAttempt.routes.filter((item) => !item.available).length,
      failure: ollamaCloudAttempt.error,
      routes: ollamaCloudAttempt.routes.map((item) => ({
        slug: item.route.slug,
        modelId: item.route.modelId,
        available: item.available,
        matchedModelId: item.matchedModelId,
        pricingCheckedAt: item.route.checkedAt,
      })),
    },
  }
}

/** Backwards-compatible name for existing admin/API callers. */
export async function runOpenRouterCatalogueVerification(): Promise<CatalogueVerificationRunReport> {
  return runCatalogueVerification()
}
