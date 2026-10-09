// Discover is a *live* OpenRouter catalogue. Source candidates are evidence
// proposals, not confirmed aliases; never present them as grounded scores.
import { rankSourceNames, type BearingModelMeta } from './alias-matching'
import { familyOf } from './model-identity'

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
  reasons: string[]
  alternatives: { name: string; score: number; flags: string[] }[]
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

  // Match within a model family. Indexing by the *smallest surface token*
  // dropped valid matches whenever spelling, word order or routing identifiers
  // varied; family gates retain those candidates without a full cross-product.
  const indexes = new Map<QualitySource, Map<string, SourceBenchmarkName[]>>()
  for (const source of SOURCES) {
    const index = new Map<string, SourceBenchmarkName[]>()
    for (const row of bySource.get(source) ?? []) {
      const family = familyOf(row.sourceModelName)
      if (!family) continue
      const bucket = index.get(family) ?? []
      bucket.push(row)
      index.set(family, bucket)
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
      const family = familyOf(meta.name.replace(/^[^:]+:\s*/, ''))
      const pool = family
        ? (indexes.get(source)?.get(family) ?? [])
        : (bySource.get(source) ?? [])
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
        reasons: chosen?.reasons ?? [],
        alternatives: ranked.slice(0, 4).map(r => ({ name: r.name, score: r.score, flags: r.flags })),
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
