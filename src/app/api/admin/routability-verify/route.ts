import { NextRequest, NextResponse } from 'next/server'
import { runRoutabilityCanary } from '@/lib/routability-canary'

/**
 * Daily runtime execution canary. This is intentionally separate from weekly
 * catalogue verification: catalogue presence and successful execution are
 * different evidence. Vercel cron authenticates with CRON_SECRET.
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
    const { observations: _observations, ...summary } = await runRoutabilityCanary()
    return NextResponse.json({
      ok: true,
      summary,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Routability verification failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
