import { NextRequest, NextResponse } from 'next/server'
import { ingestEcoLogits } from '@/lib/ingest/ecologits'

// Protected by CRON_SECRET. Vercel sends this automatically for cron jobs.
// Can also be called manually: curl -H "Authorization: Bearer $CRON_SECRET" https://yoursite.com/api/admin/ecologits-refresh
//
// The actual re-fetch loop lives in ingestEcoLogits() so the admin "Re-fetch"
// server action and this cron route share one implementation.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await ingestEcoLogits()

  return NextResponse.json({
    ok: true,
    summary: {
      updated: result.inserted,
      skippedNoProvider: result.skippedNoProvider.length,
      skippedNoMatch: result.skippedNoMatch.length,
      failed: result.failed.length,
    },
    details: {
      updated: result.updated,
      skippedNoProvider: result.skippedNoProvider,
      skippedNoMatch: result.skippedNoMatch,
      failed: result.failed,
    },
    timestamp: new Date().toISOString(),
  })
}
