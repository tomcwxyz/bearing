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

import type { BenchmarkSource } from './benchmarks'

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
