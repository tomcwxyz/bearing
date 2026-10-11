import { NextRequest, NextResponse } from 'next/server'
import { runOpenRouterCatalogueVerification } from '@/lib/verify-catalogue'

/**
 * Weekly catalogue verification. Vercel sends CRON_SECRET automatically for
 * configured cron jobs; the same endpoint can be invoked manually with a
 * Bearer token when investigating catalogue drift.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { observations: _observations, ...summary } = await runOpenRouterCatalogueVerification()
    // A partial run is useful evidence, but it is not a healthy scheduled check.
    // Non-2xx status makes provider outages visible in the Vercel cron logs.
    const sourceFailures = summary.providerFailures.length +
      (summary.openRouterFailure ? 1 : 0) +
      (summary.ollamaCloudRoutes.failure ? 1 : 0)
    return NextResponse.json({
      ok: sourceFailures === 0,
      partial: sourceFailures > 0,
      summary,
      timestamp: new Date().toISOString(),
    }, { status: sourceFailures > 0 ? 503 : 200 })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Catalogue verification failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
