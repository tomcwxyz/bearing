'use server'

import { contributorDemoEnabled } from '@/lib/contributor-demo-mode'
import { runContributorDemo, type DemoRequest } from '@/lib/contributor-fixtures'

// Server-action guard prevents access to the workbench on preview/production
// deployments even if the endpoint is called directly.
export async function recalculateContributorDemo(request: DemoRequest) {
  if (!contributorDemoEnabled()) {
    throw new Error('Contributor workbench is only available in local development mode.')
  }
  return runContributorDemo(request)
}
