'use server'

import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import { runCatalogueVerification, type CatalogueVerificationRunReport } from '@/lib/verify-catalogue'
import { listModelsForVerification, type VerificationObservation } from '@/db/model-verification'
import type { UnverifiedModel } from '@/lib/verification-scope'

async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  const admin = await isUserAdmin(user.id)
  if (!admin) throw new Error('Not authorised')
}

export async function verifyCatalogueAdmin(): Promise<{
  success: boolean
  report?: Omit<CatalogueVerificationRunReport, 'observations'>
  error?: string
}> {
  await requireAdmin()

  try {
    const { observations: _observations, ...report } = await runCatalogueVerification()
    return { success: true, report }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Catalogue verification failed',
    }
  }
}

/**
 * Verify existing live models, either all or an explicit selection of up to
 * 100. The same observational provider checks are used for draft imports.
 * Never changes model publication state or editorial metadata.
 */
export async function verifyLiveModelsAdmin(requested?: string[]): Promise<{
  targeted: number
  checked: number
  current: number
  attention: number
  unavailable: number
  unverifiedModels: UnverifiedModel[]
  observations: VerificationObservation[]
  sourceIssues: string[]
}> {
  await requireAdmin()
  if (requested !== undefined && (
    !Array.isArray(requested) || requested.length < 1 || requested.length > 100 ||
    requested.some(slug => typeof slug !== 'string' || !/^[a-zA-Z0-9._/-]{1,140}$/.test(slug))
  )) {
    throw new Error('Select between 1 and 100 valid live models')
  }
  const selected = requested === undefined ? undefined : [...new Set(requested)]
  if (selected) {
    const models = await listModelsForVerification()
    const activeSlugs = new Set(models.filter(model => model.active).map(model => model.slug))
    const invalid = selected.filter(slug => !activeSlugs.has(slug))
    if (invalid.length) throw new Error('Selection includes models that are not live')
  }
  const report = await runCatalogueVerification(selected)
  return {
    targeted: report.targeted,
    checked: report.checked,
    current: report.current,
    attention: report.attention,
    unavailable: report.unavailable,
    unverifiedModels: report.unverifiedModels,
    observations: report.observations,
    sourceIssues: [
      ...report.providerFailures.map(item => `${item.provider}: ${item.error}`),
      ...(report.openRouterFailure ? [`OpenRouter: ${report.openRouterFailure}`] : []),
      ...(report.ollamaCloudRoutes.failure ? [`Ollama Cloud: ${report.ollamaCloudRoutes.failure}`] : []),
    ],
  }
}
