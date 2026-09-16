'use server'

import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import { getRoutabilitySummaries, type RoutabilitySummary } from '@/db/model-routability'
import { runRoutabilityCanary } from '@/lib/routability-canary'
import { runCatalogueVerification } from '@/lib/verify-catalogue'
import { ingestEcoLogits } from '@/lib/ingest/ecologits'

export interface MaintenanceState {
  cronConfigured: boolean
  routability: RoutabilitySummary[]
}

export interface MaintenanceRunResult {
  success: boolean
  message: string
  routability?: RoutabilitySummary[]
}

async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  if (!await isUserAdmin(user.id)) throw new Error('Not authorised')
}

export async function runRoutabilityMaintenance(): Promise<MaintenanceRunResult> {
  try {
    await requireAdmin()
    const { observations: _observations, ...summary } = await runRoutabilityCanary()
    const routability = await getRoutabilitySummaries()
    return {
      success: true,
      message: `Routability checked ${summary.checked} models: ${summary.healthy} healthy, ${summary.degraded} degraded, ${summary.unavailable} unavailable, ${summary.skipped} skipped.`,
      routability,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Routability check failed.',
    }
  }
}

export async function runCatalogueMaintenance(): Promise<MaintenanceRunResult> {
  try {
    await requireAdmin()
    const { observations: _observations, ...report } = await runCatalogueVerification()
    return {
      success: true,
      message: `Catalogue checked ${report.checked} models: ${report.current} current, ${report.attention} need attention, ${report.unavailable} unavailable, ${report.unmapped} unmapped.`,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Catalogue verification failed.',
    }
  }
}

export async function runEcoLogitsMaintenance(): Promise<MaintenanceRunResult> {
  try {
    await requireAdmin()
    const result = await ingestEcoLogits()
    return {
      success: true,
      message: `EcoLogits refreshed ${result.inserted} models: ${result.skippedNoProvider.length} skipped without provider, ${result.skippedNoMatch.length} unmatched, ${result.failed.length} failed.`,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'EcoLogits refresh failed.',
    }
  }
}
