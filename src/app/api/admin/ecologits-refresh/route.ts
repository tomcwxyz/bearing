import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { fetchEcoLogitsScore, ECOLOGITS_PROVIDER_MAP } from '@/lib/ecologits-grounding'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

// Protected by CRON_SECRET. Vercel sends this automatically for cron jobs.
// Can also be called manually: curl -H "Authorization: Bearer $CRON_SECRET" https://yoursite.com/api/admin/ecologits-refresh
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = getDb()

  // Fetch all active chat models
  const rows = await sql`
    SELECT slug, provider FROM models
    WHERE active = true AND model_class = 'chat'
    ORDER BY provider, slug
  `

  const results = {
    updated: [] as string[],
    skippedNoProvider: [] as string[],
    skippedNoMatch: [] as string[],
    failed: [] as string[],
  }

  for (const row of rows) {
    const slug = row.slug as string
    const provider = row.provider as string

    if (!ECOLOGITS_PROVIDER_MAP[provider]) {
      results.skippedNoProvider.push(slug)
      continue
    }

    try {
      const score = await fetchEcoLogitsScore(slug, provider, { storeInDb: true })
      if (score) {
        results.updated.push(slug)
      } else {
        results.skippedNoMatch.push(slug)
      }
    } catch {
      results.failed.push(slug)
    }
  }

  return NextResponse.json({
    ok: true,
    summary: {
      updated: results.updated.length,
      skippedNoProvider: results.skippedNoProvider.length,
      skippedNoMatch: results.skippedNoMatch.length,
      failed: results.failed.length,
    },
    details: results,
    timestamp: new Date().toISOString(),
  })
}
