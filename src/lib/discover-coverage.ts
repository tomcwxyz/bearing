// Discover is a *live* OpenRouter catalogue. Source candidates are evidence
// proposals, not confirmed aliases; never present them as grounded scores.
import { rankSourceNames, type BearingModelMeta } from './alias-matching'

export type QualitySource = 'lmarena' | 'artificialanalysis'
export type CoverageStatus = 'candidate' | 'review' | 'none'

export interface SourceBenchmarkName {
  source: QualitySource
  sourceModelName: string
  latestSnapshot: string | null
  lastCapturedAt: string | null
  qualityCategories: number
}
export interface SourceCoverage {
  source: QualitySource
  status: CoverageStatus
  sourceModelName: string | null
  variants: number
  qualityCategories: number
  latestSnapshot: string | null
  lastCapturedAt: string | null
  flags: string[]
  stale: boolean
}
export interface DiscoverCoverage {
  status: CoverageStatus
  sources: SourceCoverage[]
  latestSnapshot: string | null
  stale: boolean
}

const SOURCES: QualitySource[] = ['lmarena', 'artificialanalysis']
const STALE_DAYS = 60
export function isStaleSnapshot(snapshot: string | null, now: Date = new Date()): boolean {
  if (!snapshot) return true
  const time = Date.parse(snapshot)
  return !Number.isFinite(time) || now.getTime() - time > STALE_DAYS * 86400000
}

function openRouterSlug(id: string): string {
  const slash = id.indexOf('/')
  return slash === -1 ? id : id.slice(slash + 1)
}

export function assessDiscoverCoverage(
  models: Array<{ id: string; name: string; provider: string }>,
  snapshots: SourceBenchmarkName[],
  now: Date = new Date(),
): Record<string, DiscoverCoverage> {
  // One index for the full catalogue, rather than one database query per model.
  const bySource = new Map<QualitySource, SourceBenchmarkName[]>()
  for (const source of SOURCES) bySource.set(source, [])
  for (const row of snapshots) bySource.get(row.source)?.push(row)

  // Token-index candidates once: large OpenRouter catalogues shouldn't need
  // every model to compare against every historic source name.
  const indexes = new Map<QualitySource, Map<string, SourceBenchmarkName[]>>()
  for (const source of SOURCES) {
    const index = new Map<string, SourceBenchmarkName[]>()
    for (const row of bySource.get(source) ?? []) {
      for (const token of new Set(row.sourceModelName.toLowerCase().match(/[a-z]{3,}/g) ?? [])) {
        const group = index.get(token) ?? []
        group.push(row)
        index.set(token, group)
      }
    }
    indexes.set(source, index)
  }

  const out: Record<string, DiscoverCoverage> = {}
  for (const model of models) {
    const meta: BearingModelMeta = {
      slug: openRouterSlug(model.id), name: model.name, provider: model.provider,
    }
    const sourceCoverage: SourceCoverage[] = []
    for (const source of SOURCES) {
      const tokens = meta.name.replace(/^[^:]+:\s*/, '').toLowerCase().match(/[a-z]{3,}/g) ?? []
      const index = indexes.get(source)!
      // Find smallest candidate bucket. Fall back to all names when no
      // long alpha token is present (e.g. unusually named numerical models).
      const buckets = tokens.map(t => index.get(t)).filter((v): v is SourceBenchmarkName[] => !!v)
      const pool = buckets.length
        ? buckets.reduce((best, next) => next.length < best.length ? next : best)
        : bySource.get(source)!
      const metaByName = new Map(pool.map(row => [row.sourceModelName, row]))
      const ranked = rankSourceNames(meta, pool.map(row => ({ name: row.sourceModelName })))
      const safe = ranked.filter(r => r.flags.length === 0 && r.confidence !== 'weak')
      const chosen = (safe.length === 1 ? safe[0] : ranked[0]) ?? null
      const details = chosen ? metaByName.get(chosen.name) : undefined
      const status: CoverageStatus = safe.length === 1 ? 'candidate' : ranked.length ? 'review' : 'none'
      sourceCoverage.push({
        source, status, sourceModelName: chosen?.name ?? null,
        variants: ranked.length,
        qualityCategories: details?.qualityCategories ?? 0,
        latestSnapshot: details?.latestSnapshot ?? null,
        lastCapturedAt: details?.lastCapturedAt ?? null,
        flags: chosen?.flags ?? [],
        stale: isStaleSnapshot(details?.latestSnapshot ?? null, now),
      })
    }
    const status: CoverageStatus = sourceCoverage.some(s => s.status === 'candidate')
      ? 'candidate' : sourceCoverage.some(s => s.status === 'review') ? 'review' : 'none'
    const dates = sourceCoverage.map(s => s.latestSnapshot).filter((d): d is string => !!d)
    const latestSnapshot = dates.sort().at(-1) ?? null
    out[model.id] = {
      status, sources: sourceCoverage, latestSnapshot,
      stale: sourceCoverage.every(s => s.stale),
    }
  }
  return out
}
