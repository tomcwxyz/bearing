// Suggest benchmark-source aliases for a registry model at import time.
//
// Matching has to handle a few realities of the source catalogues:
//   - AA splits frontier models into reasoning / non-reasoning / effort
//     variants ("Claude 4.5 Haiku (Reasoning)", "GPT-5.4 mini (xhigh)") so a
//     single bearing model maps to many AA candidates.
//   - AA names use family-then-version with spacing ("Claude 4.5 Haiku")
//     while bearing slugs use family-then-version with hyphens
//     ("claude-haiku-4.5"). Either word ordering is valid — we tokenise so
//     order doesn't matter.
//   - AA sometimes joins family+version ("Qwen3 235B A22B") where the
//     registry splits them ("Qwen 3 235B"). We emit both joined and split
//     atoms into the token bag so either form matches.
//
// Strategy: produce ranked candidates with non-blocking flags (e.g.
// "distill", "vl", "mini"). Admin confirms — false suggestions are cheap,
// false rejections are expensive. Unflagged matches sort first.

import { CATEGORY_TO_TASKS, type BenchmarkSource } from './benchmarks'
import type { TaskType } from './registry'
import { neon } from '@neondatabase/serverless'
import {
  rankSourceNames,
  type AliasCandidate,
  type BearingModelMeta,
  type RankedSourceName,
} from './alias-matching'

// The matcher core (tokeniser + scorer) now lives in alias-matching.ts so the
// import form, the admin Unmatched UI, re-ingest auto-apply, and EcoLogits all
// share one implementation. Re-exported here for existing importers.
export {
  normaliseModelName, tokenise,
  type AliasCandidate, type BearingModelMeta,
} from './alias-matching'

/** Back-compat alias — identical to the shared RankedSourceName. */
export type AliasSuggestion = RankedSourceName

/** Bearing-slug prefixes with no plausible coverage in any external source. */
const NO_AA_COVERAGE_PREFIXES = ['greenpt-', 'codestral-', 'devstral', 'mistral-ocr', 'ibm-granite-']

/**
 * Score-and-rank source candidates against a registry model (import form).
 * Thin wrapper over the shared `rankSourceNames`, adding the no-coverage
 * allowlist: some bearing models have no plausible match in any source, so we
 * return nothing rather than offer misleading suggestions.
 */
export function suggestBenchmarkAliases(
  bearing: BearingModelMeta,
  source: BenchmarkSource,
  candidates: AliasCandidate[],
  options: { minQueryTokens?: number } = {},
): AliasSuggestion[] {
  if (NO_AA_COVERAGE_PREFIXES.some(p => bearing.slug.startsWith(p))) return []
  void source // matching is source-agnostic; param kept for call-site clarity
  return rankSourceNames(bearing, candidates, options)
}

// ---------------------------------------------------------------------------
// Grounded estimation
// ---------------------------------------------------------------------------

/**
 * Provider-level profile defaults — privacy posture, open-weights status,
 * and a baseline transparency_score. Admin can override per-model in the
 * import form. Names match the values produced by extractProvider() in
 * src/lib/openrouter.ts.
 *
 * `openWeights`: 1 when the provider publishes their model weights publicly
 *   for the lineup represented by `provider`. Mistral is mixed (some open,
 *   flagship closed) and intentionally defaults to 0 — admin overrides.
 * `baselineTransparency`: rough FMTI-style aggregate. Closed providers cluster
 *   at 0.35–0.45; open-weight providers at 0.6–0.7. Used as the starting
 *   value for `transparency.transparency_score`; Haiku still writes the
 *   remaining sub-fields (open_methodology, open_training_data, …) and notes.
 * `licenceOpenness`: how permissive the model licence is (0 = proprietary,
 *   1 = fully open / OSI-permissive). Distinct from `openWeights`: a model can
 *   ship weights under a restrictive licence (Meta's Llama community licence ≈
 *   0.6) or a permissive one (Kimi/DeepSeek MIT, Granite/Qwen Apache ≈ 0.85–0.9).
 *   Grounded (forced over Haiku) so an open-weight model is never mislabelled
 *   proprietary just because Haiku doesn't recognise the family.
 */
interface ProviderProfile {
  privacy: number
  openWeights: 0 | 1
  licenceOpenness: number
  baselineTransparency: number
}

const PROVIDER_PROFILE: Record<string, ProviderProfile> = {
  Anthropic: { privacy: 0.85, openWeights: 0, licenceOpenness: 0.1, baselineTransparency: 0.4 },
  OpenAI: { privacy: 0.75, openWeights: 0, licenceOpenness: 0.1, baselineTransparency: 0.35 },
  Google: { privacy: 0.7, openWeights: 0, licenceOpenness: 0.15, baselineTransparency: 0.45 },
  Mistral: { privacy: 0.85, openWeights: 0, licenceOpenness: 0.4, baselineTransparency: 0.55 },
  DeepSeek: { privacy: 0.5, openWeights: 1, licenceOpenness: 0.9, baselineTransparency: 0.65 },
  xAI: { privacy: 0.6, openWeights: 0, licenceOpenness: 0.2, baselineTransparency: 0.35 },
  Meta: { privacy: 0.75, openWeights: 1, licenceOpenness: 0.6, baselineTransparency: 0.7 },
  Alibaba: { privacy: 0.5, openWeights: 1, licenceOpenness: 0.85, baselineTransparency: 0.65 },
  MiniMax: { privacy: 0.5, openWeights: 0, licenceOpenness: 0.3, baselineTransparency: 0.4 },
  Moonshot: { privacy: 0.5, openWeights: 1, licenceOpenness: 0.9, baselineTransparency: 0.6 },
  IBM: { privacy: 0.85, openWeights: 1, licenceOpenness: 0.9, baselineTransparency: 0.7 },
  GreenPT: { privacy: 0.9, openWeights: 0, licenceOpenness: 0.3, baselineTransparency: 0.6 },
  // Open-weight providers. licenceOpenness reflects the released models' licence:
  // permissive OSI (MIT/Apache) ≈ 0.85–0.95; vendor "open" licences with caps
  // ≈ 0.55–0.8; weights-released-but-non-commercial ≈ 0.3.
  Liquid: { privacy: 0.8, openWeights: 1, licenceOpenness: 0.55, baselineTransparency: 0.6 },   // LFM2 — on-device; LFM Open License (revenue-capped commercial use)
  'Z.ai': { privacy: 0.5, openWeights: 1, licenceOpenness: 0.9, baselineTransparency: 0.65 },   // GLM-4.5/4.6 — MIT
  Cohere: { privacy: 0.6, openWeights: 1, licenceOpenness: 0.3, baselineTransparency: 0.55 },   // Command family weights released CC-BY-NC (non-commercial)
  Microsoft: { privacy: 0.7, openWeights: 1, licenceOpenness: 0.9, baselineTransparency: 0.6 }, // Phi — MIT
  NVIDIA: { privacy: 0.6, openWeights: 1, licenceOpenness: 0.8, baselineTransparency: 0.65 },   // Nemotron — NVIDIA Open Model License (commercial OK)
  AI21: { privacy: 0.6, openWeights: 1, licenceOpenness: 0.7, baselineTransparency: 0.55 },     // Jamba — Jamba Open Model License
  AllenAI: { privacy: 0.5, openWeights: 1, licenceOpenness: 0.95, baselineTransparency: 0.85 }, // OLMo — Apache 2.0, fully open (data + code + weights)
  'Nous Research': { privacy: 0.6, openWeights: 1, licenceOpenness: 0.6, baselineTransparency: 0.55 }, // Hermes — fine-tunes inheriting base (Llama community) licence
}

const DEFAULT_PROFILE: ProviderProfile = { privacy: 0.6, openWeights: 0, licenceOpenness: 0.2, baselineTransparency: 0.4 }

/**
 * Normalise a registry/OpenRouter provider string into a key matching
 * PROVIDER_PROFILE. Strips parenthetical suffixes and case-insensitively
 * matches against known providers.
 *
 * Without this, registry entries like "Alibaba (via hosted providers)" fall
 * through to the default profile and incorrectly report Qwen as closed-weight.
 */
export function normaliseProvider(provider: string): string | null {
  const trimmed = provider.replace(/\s*\([^)]*\)\s*$/, '').trim()
  // Compare on a punctuation/space-stripped, lowercased form so registry
  // variants resolve to the same profile ("z-ai" / "Z.ai" → "zai",
  // "Nous Research" → "nousresearch"). Avoids a separate alias table.
  const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const target = canon(trimmed)
  for (const key of Object.keys(PROVIDER_PROFILE)) {
    if (canon(key) === target) return key
  }
  return null
}

/** Threshold for the grounded `code` capability flag. */
export const CODE_CAPABILITY_THRESHOLD = 0.5

export type Provenance = 'benchmark' | 'derived' | 'haiku' | 'default' | 'ecologits'

export interface GroundedField<T> {
  value: T
  provenance: Provenance
  /** When provenance is 'benchmark', the (source, category) pairs that contributed. */
  evidence?: string[]
}

export interface GroundedFields {
  taskFitness: Partial<Record<TaskType, GroundedField<number>>>
  speedScore: GroundedField<number> | null
  privacyScore: GroundedField<number>
  openWeights: GroundedField<0 | 1>
  licenceOpenness: GroundedField<number>
  baselineTransparency: GroundedField<number>
  /** Verbatim raw evidence to include in the Haiku prompt for downstream context. */
  evidenceForPrompt: string[]
}

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

interface SelectedAlias {
  source: BenchmarkSource
  sourceModelName: string
}

/** A snapshot row as already fetched from benchmark_snapshots. */
export interface SnapshotRowForGrounding {
  source: BenchmarkSource
  sourceCategory: string
  normalisedScore: number
  rawScore: number
  signalType: 'task' | 'speed' | 'latency'
}

/**
 * Pure aggregation: bucket the snapshot rows into bearing TaskTypes via
 * CATEGORY_TO_TASKS, average per task, and stamp provenance. Provider
 * profile drives privacy/open_weights/baseline transparency.
 *
 * Separated from groundFromAliases so tests can exercise the math without
 * touching the database.
 */
export function aggregateGroundedFields(
  rows: SnapshotRowForGrounding[],
  provider: string,
): GroundedFields {
  const normalised = normaliseProvider(provider)
  const profile = normalised ? PROVIDER_PROFILE[normalised] : DEFAULT_PROFILE
  const provenance: Provenance = normalised ? 'derived' : 'default'
  const privacyScore: GroundedField<number> = { value: profile.privacy, provenance }
  const openWeights: GroundedField<0 | 1> = { value: profile.openWeights, provenance }
  const licenceOpenness: GroundedField<number> = { value: profile.licenceOpenness, provenance }
  const baselineTransparency: GroundedField<number> = { value: profile.baselineTransparency, provenance }

  const taskBuckets = new Map<TaskType, { scores: number[]; evidence: Set<string> }>()
  const speedScores: number[] = []
  const evidenceForPrompt: string[] = []

  for (const row of rows) {
    const { source, sourceCategory: cat, normalisedScore: score, rawScore: raw, signalType: sig } = row

    if (sig === 'speed') {
      speedScores.push(score)
      evidenceForPrompt.push(`${source}::${cat} = ${score.toFixed(2)} (raw ${raw.toFixed(0)} tok/s)`)
      continue
    }
    if (sig === 'latency') continue // not consumed for v1

    const tasks = CATEGORY_TO_TASKS[source]?.[cat]
    if (!tasks) continue
    for (const task of tasks) {
      const bucket = taskBuckets.get(task) ?? { scores: [], evidence: new Set() }
      bucket.scores.push(score)
      bucket.evidence.add(`${source}::${cat}`)
      taskBuckets.set(task, bucket)
    }
    evidenceForPrompt.push(`${source}::${cat} = ${score.toFixed(2)}`)
  }

  const taskFitness: Partial<Record<TaskType, GroundedField<number>>> = {}
  for (const [task, b] of taskBuckets) {
    const mean = b.scores.reduce((a, c) => a + c, 0) / b.scores.length
    taskFitness[task] = {
      value: Math.round(mean * 100) / 100,
      provenance: 'benchmark',
      evidence: [...b.evidence].sort(),
    }
  }

  const speedScore = speedScores.length > 0
    ? {
        value: Math.round((speedScores.reduce((a, c) => a + c, 0) / speedScores.length) * 100) / 100,
        provenance: 'benchmark' as const,
        evidence: ['artificialanalysis::aa_speed'],
      }
    : null

  return { taskFitness, speedScore, privacyScore, openWeights, licenceOpenness, baselineTransparency, evidenceForPrompt }
}

/**
 * Compute grounded fields from a list of selected benchmark aliases. Reads
 * the latest snapshot per (source, source_category, source_model_name) for
 * the selected names and delegates to aggregateGroundedFields() for the math.
 */
export async function groundFromAliases(
  aliases: SelectedAlias[],
  provider: string,
): Promise<GroundedFields> {
  if (aliases.length === 0) {
    return aggregateGroundedFields([], provider)
  }

  // Fetch latest snapshot per (source_category, source_model_name) for the
  // selected aliases. Query per-source so we can use parameterised ANY()
  // rather than building tuple lists with sql.unsafe.
  const sql = getDb()
  const bySource = new Map<BenchmarkSource, string[]>()
  for (const a of aliases) {
    const list = bySource.get(a.source) ?? []
    list.push(a.sourceModelName)
    bySource.set(a.source, list)
  }
  const allRows: SnapshotRowForGrounding[] = []
  for (const [source, names] of bySource) {
    const rows = await sql`
      SELECT DISTINCT ON (source_category, source_model_name)
        source_category, normalised_score, raw_score, signal_type
      FROM benchmark_snapshots
      WHERE source = ${source} AND source_model_name = ANY(${names})
      ORDER BY source_category, source_model_name, snapshot_date DESC, captured_at DESC
    `
    for (const r of rows) {
      allRows.push({
        source,
        sourceCategory: r.source_category as string,
        normalisedScore: Number(r.normalised_score),
        rawScore: Number(r.raw_score),
        signalType: r.signal_type as 'task' | 'speed' | 'latency',
      })
    }
  }

  return aggregateGroundedFields(allRows, provider)
}

