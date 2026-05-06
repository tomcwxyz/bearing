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

/** Bearing-slug prefixes with no plausible coverage in any external source. */
const NO_AA_COVERAGE_PREFIXES = ['greenpt-', 'codestral-', 'devstral', 'mistral-ocr', 'ibm-granite-']

/**
 * Tokens that, when present in a candidate but not in the query, signal a
 * potentially distinct sibling product. Surfaced as flags, not rejections.
 */
const SIZE_DISAMBIGUATORS = new Set([
  'nano', 'mini', 'micro', 'small', 'medium', 'large', 'huge', 'plus',
  'lite', 'fast', 'scout', 'flash', 'pro', 'sonnet', 'haiku', 'opus',
  'distill', 'vl', 'omni', 'coder', 'thinking',
])

/** Product-suffix noise removed everywhere. */
const PRODUCT_NOISE_RE = /\b(preview|experimental|exp|instruct|chat|terminus|speciale)\b/gi

/** Effort/reasoning markers — only stripped when inside parentheses. */
const PAREN_NOISE_RE = /\b(reasoning|non-reasoning|nonreasoning|adaptive|low|high|med|medium|max|min|effort|xhigh)\b/gi

/** Date suffixes like "Sep '25" or "Jan 2025". */
const DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*['']?\d{2,4}\b/gi

/**
 * Normalise to whitespace-separated tokens (still as a string).
 * Parens get their content emitted with paren-noise stripped.
 */
export function normaliseModelName(input: string): string {
  return input
    .replace(/\(([^)]*)\)/g, (_match, inner) => ' ' + inner.replace(PAREN_NOISE_RE, ' ') + ' ')
    .replace(DATE_RE, ' ')
    .replace(PRODUCT_NOISE_RE, ' ')
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9. ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Tokenise. For tokens of the form `<alpha2+><digits...>` (e.g. "qwen3",
 * "claude4.5"), also emit the alpha and digit halves separately, so that
 * "Qwen3 235B" and "Qwen 3 235B" produce overlapping bags.
 */
export function tokenise(input: string): Set<string> {
  const out = new Set<string>()
  for (const tok of normaliseModelName(input).split(' ')) {
    if (!tok) continue
    out.add(tok)
    const m = /^([a-z]{2,})(\d[\d.]*)$/.exec(tok)
    if (m) {
      out.add(m[1])
      out.add(m[2])
    }
  }
  return out
}

export interface AliasCandidate {
  /** Display name as shown by the source. */
  name: string
  /** Source-side slug, when available. */
  slug?: string
}

export interface AliasSuggestion extends AliasCandidate {
  score: number
  /** Non-blocking notes — extra disambiguator tokens the admin should weigh. */
  flags: string[]
}

export interface BearingModelMeta {
  slug: string
  name: string
  provider: string
}

/**
 * Score-and-rank candidates against a registry model.
 *
 * A candidate matches when every query token appears in the candidate token
 * bag (subset). Score = |query| / |candidate| — higher means the candidate
 * is a tighter fit, with fewer extra tokens. Disambiguator tokens in the
 * extra set are surfaced as flags. Results sort unflagged-first, then by
 * score desc.
 *
 * Returns empty for slugs in the no-coverage allowlist.
 */
export function suggestBenchmarkAliases(
  bearing: BearingModelMeta,
  source: BenchmarkSource,
  candidates: AliasCandidate[],
  options: { minQueryTokens?: number } = {},
): AliasSuggestion[] {
  if (NO_AA_COVERAGE_PREFIXES.some(p => bearing.slug.startsWith(p))) return []

  const minQueryTokens = options.minQueryTokens ?? 2
  const queryTokens = tokenise(`${bearing.slug} ${bearing.name}`)
  if (queryTokens.size < minQueryTokens) return []

  const out: AliasSuggestion[] = []
  for (const cand of candidates) {
    const candTokens = tokenise(cand.name)
    const subset = [...queryTokens].every(t => candTokens.has(t))
    if (!subset) continue

    const score = candTokens.size > 0 ? queryTokens.size / candTokens.size : 0

    const flags: string[] = []
    for (const t of candTokens) {
      if (SIZE_DISAMBIGUATORS.has(t) && !queryTokens.has(t)) flags.push(t)
    }
    flags.sort((a, b) => (a === 'distill' ? -1 : b === 'distill' ? 1 : a.localeCompare(b)))

    out.push({ name: cand.name, slug: cand.slug, score, flags })
    void source
  }

  // Unflagged first, then by score desc, then by name for stable ordering.
  return out.sort((a, b) => {
    if ((a.flags.length === 0) !== (b.flags.length === 0)) return a.flags.length === 0 ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    return a.name.localeCompare(b.name)
  })
}

// ---------------------------------------------------------------------------
// Grounded estimation
// ---------------------------------------------------------------------------

/**
 * Provider-level privacy defaults. Driven by published policies (zero data
 * retention, training opt-out, jurisdictional considerations). Admin can
 * override per-model in the import form. Names match the values produced by
 * extractProvider() in src/lib/openrouter.ts.
 */
const PROVIDER_PRIVACY: Record<string, number> = {
  Anthropic: 0.85,
  OpenAI: 0.75,
  Google: 0.7,
  Mistral: 0.85,
  DeepSeek: 0.5,
  xAI: 0.6,
  Meta: 0.75,
  Alibaba: 0.5,
  MiniMax: 0.5,
  Moonshot: 0.5,
  IBM: 0.85,
  GreenPT: 0.9,
}

export type Provenance = 'benchmark' | 'derived' | 'haiku' | 'default'

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

/**
 * Compute grounded fields from a list of selected benchmark aliases. Reads
 * the latest snapshot per (source, source_category, source_model_name) for
 * the selected names and buckets by bearing task type using CATEGORY_TO_TASKS.
 *
 * Speed comes from AA's `aa_speed` cohort-normalised score; if no AA alias
 * is selected, returns null and Haiku will fill it.
 *
 * Privacy is a deterministic provider-table lookup, not Haiku.
 */
export async function groundFromAliases(
  aliases: SelectedAlias[],
  provider: string,
): Promise<GroundedFields> {
  const privacyDefault = PROVIDER_PRIVACY[provider] ?? 0.6
  const privacyScore: GroundedField<number> = {
    value: privacyDefault,
    provenance: provider in PROVIDER_PRIVACY ? 'derived' : 'default',
  }

  if (aliases.length === 0) {
    return { taskFitness: {}, speedScore: null, privacyScore, evidenceForPrompt: [] }
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
  const allRows: Array<{ source: BenchmarkSource; source_category: string; source_model_name: string; normalised_score: number; raw_score: number; signal_type: string }> = []
  for (const [source, names] of bySource) {
    const rows = await sql`
      SELECT DISTINCT ON (source_category, source_model_name)
        source_category, source_model_name, normalised_score, raw_score, signal_type
      FROM benchmark_snapshots
      WHERE source = ${source} AND source_model_name = ANY(${names})
      ORDER BY source_category, source_model_name, snapshot_date DESC, captured_at DESC
    `
    for (const r of rows) {
      allRows.push({
        source,
        source_category: r.source_category as string,
        source_model_name: r.source_model_name as string,
        normalised_score: Number(r.normalised_score),
        raw_score: Number(r.raw_score),
        signal_type: r.signal_type as string,
      })
    }
  }

  // Bucket task scores by bearing task.
  const taskBuckets = new Map<TaskType, { scores: number[]; evidence: Set<string> }>()
  const speedScores: number[] = []
  const evidenceForPrompt: string[] = []

  for (const row of allRows) {
    const source = row.source
    const cat = row.source_category
    const score = row.normalised_score
    const raw = row.raw_score
    const sig = row.signal_type

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
      evidence: [...b.evidence],
    }
  }

  const speedScore = speedScores.length > 0
    ? {
        value: Math.round((speedScores.reduce((a, c) => a + c, 0) / speedScores.length) * 100) / 100,
        provenance: 'benchmark' as const,
        evidence: ['artificialanalysis::aa_speed'],
      }
    : null

  return { taskFitness, speedScore, privacyScore, evidenceForPrompt }
}

