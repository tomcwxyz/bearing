export type BenchmarkAgreement = 'none' | 'aligned' | 'tension' | 'strong_disagreement'
export type BenchmarkEvidenceStrength = 'none' | 'low' | 'medium' | 'high'

export interface BenchmarkAggregate {
  score: number
  sourceCount: number
  categoryCount: number
  latestSnapshot: string | null
  totalVotes: number | null
}

/**
 * A normal benchmark score map can carry the evidence used to decide how much
 * influence each score deserves. Keeping the aggregate metadata on the map
 * preserves the existing synchronous scoring API while making the ranking
 * policy evidence-aware.
 */
export type BenchmarkScoreMap = Map<string, number> & {
  aggregates?: Map<string, BenchmarkAggregate>
}

export interface BenchmarkEvidence {
  agreement: BenchmarkAgreement
  strength: BenchmarkEvidenceStrength
  benchmarkScore: number | null
  curatedScore: number | null
  delta: number | null
  sourceCount: number
  categoryCount: number
  latestSnapshot: string | null
  totalVotes: number | null
  label: string
  detail: string
  uncertainty: number
  blendReliability: number
}

function ageInDays(date: string | null, now: Date): number | null {
  if (!date) return null
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 86_400_000))
}

export function benchmarkEvidenceStrength(
  aggregate: BenchmarkAggregate,
  now: Date = new Date(),
): BenchmarkEvidenceStrength {
  const age = ageInDays(aggregate.latestSnapshot, now)
  if (age == null) return 'low'
  if (aggregate.sourceCount >= 2 && aggregate.categoryCount >= 2 && age <= 90) return 'high'
  if (aggregate.sourceCount >= 1 && age <= 180) return 'medium'
  return 'low'
}

/**
 * Convert evidence coverage/recency into a multiplier for BENCHMARK_BLEND.
 * BENCHMARK_BLEND remains the maximum external-evidence influence; this
 * reliability factor decides how much of that ceiling a particular model/task
 * pair has earned.
 *
 * Missing aggregate metadata is deliberately conservative rather than zero so
 * older/synthetic callers can still exercise benchmark blending without being
 * treated as equally trustworthy to fresh multi-source production evidence.
 */
export function benchmarkBlendReliability(
  aggregate: BenchmarkAggregate | null | undefined,
  now: Date = new Date(),
): number {
  if (!aggregate) return 0.25
  const strength = benchmarkEvidenceStrength(aggregate, now)
  if (strength === 'high') return 1
  if (strength === 'medium') return 0.65
  return 0.30
}

/**
 * Describe benchmark/curated agreement. Disagreement is itself evidence: it
 * raises uncertainty and can trigger an experiment, while coverage/recency
 * separately determine how much influence the benchmark earns in ranking.
 */
export function benchmarkEvidence(input: {
  curatedScore: number | null | undefined
  aggregate: BenchmarkAggregate | null | undefined
  now?: Date
}): BenchmarkEvidence {
  const curatedScore = input.curatedScore ?? null
  const aggregate = input.aggregate ?? null
  const now = input.now ?? new Date()

  if (curatedScore == null || !aggregate) {
    return {
      agreement: 'none',
      strength: 'none',
      benchmarkScore: aggregate?.score ?? null,
      curatedScore,
      delta: null,
      sourceCount: aggregate?.sourceCount ?? 0,
      categoryCount: aggregate?.categoryCount ?? 0,
      latestSnapshot: aggregate?.latestSnapshot ?? null,
      totalVotes: aggregate?.totalVotes ?? null,
      label: 'Benchmark evidence: none',
      detail: 'Bearing does not have comparable external benchmark evidence for this model and task yet.',
      uncertainty: 0.5,
      blendReliability: benchmarkBlendReliability(aggregate, now),
    }
  }

  const delta = Math.abs(curatedScore - aggregate.score)
  const agreement: BenchmarkAgreement = delta <= 0.10
    ? 'aligned'
    : delta <= 0.20
      ? 'tension'
      : 'strong_disagreement'
  const strength = benchmarkEvidenceStrength(aggregate, now)
  const signedDelta = aggregate.score - curatedScore
  const direction = signedDelta >= 0 ? 'higher' : 'lower'
  const points = Math.round(Math.abs(signedDelta) * 100)
  const age = ageInDays(aggregate.latestSnapshot, now)

  const coverage = `${aggregate.sourceCount} source${aggregate.sourceCount === 1 ? '' : 's'} / ${aggregate.categoryCount} categor${aggregate.categoryCount === 1 ? 'y' : 'ies'}`
  const recency = age == null ? 'snapshot age unknown' : `latest snapshot ${age} day${age === 1 ? '' : 's'} old`
  const votes = aggregate.totalVotes != null ? ` · ${aggregate.totalVotes.toLocaleString('en-GB')} reported votes/samples` : ''

  const label = agreement === 'aligned'
    ? 'Benchmark evidence: aligned'
    : agreement === 'tension'
      ? 'Benchmark evidence: some tension'
      : 'Benchmark evidence: strong disagreement'

  // Uncertainty is intentionally not a performance score. A strong, well-
  // supported disagreement is the most useful case to challenge experimentally.
  const disagreementWeight = agreement === 'strong_disagreement' ? 1 : agreement === 'tension' ? 0.6 : 0.1
  const strengthWeight = strength === 'high' ? 1 : strength === 'medium' ? 0.75 : strength === 'low' ? 0.5 : 0.25
  const uncertainty = Math.min(1, disagreementWeight * (0.55 + 0.45 * strengthWeight))

  return {
    agreement,
    strength,
    benchmarkScore: aggregate.score,
    curatedScore,
    delta,
    sourceCount: aggregate.sourceCount,
    categoryCount: aggregate.categoryCount,
    latestSnapshot: aggregate.latestSnapshot,
    totalVotes: aggregate.totalVotes,
    label,
    detail: `External benchmark evidence is ${points} points ${direction} than Bearing's curated task score (${coverage} · ${recency}${votes}). Evidence strength: ${strength}.`,
    uncertainty,
    blendReliability: benchmarkBlendReliability(aggregate, now),
  }
}
