import { listModelsForVerification, saveVerificationObservations } from '@/db/model-verification'
import { assessOpenRouterCatalogue, type CatalogueVerificationReport } from './catalogue-verification'
import { fetchOpenRouterModels } from './openrouter'

/**
 * Shared implementation for the admin button and scheduled catalogue check.
 * Fetch first, assess purely, then persist the complete observation batch so a
 * network failure never partially marks the catalogue as unavailable.
 */
export async function runOpenRouterCatalogueVerification(): Promise<CatalogueVerificationReport> {
  const [models, openRouterModels] = await Promise.all([
    listModelsForVerification(),
    fetchOpenRouterModels(),
  ])

  const report = assessOpenRouterCatalogue(models, openRouterModels)
  await saveVerificationObservations(report.observations)
  return report
}
