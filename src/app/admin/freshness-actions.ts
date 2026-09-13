'use server'

import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/lib/db'
import { runOpenRouterCatalogueVerification } from '@/lib/verify-catalogue'
import type { CatalogueVerificationReport } from '@/lib/catalogue-verification'

async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  const admin = await isUserAdmin(user.id)
  if (!admin) throw new Error('Not authorised')
}

export async function verifyOpenRouterCatalogueAdmin(): Promise<{
  success: boolean
  report?: Omit<CatalogueVerificationReport, 'observations'>
  error?: string
}> {
  await requireAdmin()

  try {
    const { observations: _observations, ...report } = await runOpenRouterCatalogueVerification()
    return { success: true, report }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Catalogue verification failed',
    }
  }
}
