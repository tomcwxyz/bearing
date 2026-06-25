// Shared model-name alias matcher.
//
// One tokeniser + one scorer, used by every place that maps an external
// benchmark source's model name to a Bearing registry model:
//   - import-grounding  → model → ranked source-name candidates (import form)
//   - admin Benchmarks  → source name → ranked slug suggestions (unmatched UI)
//   - re-ingest         → exact-unique source name → slug, applied automatically
//   - ecologits         → bearing slug → EcoLogits API model name (resolveModelName)
//
// Matching has to handle a few realities of the source catalogues:
//   - AA splits frontier models into reasoning / non-reasoning / effort
//     variants ("Claude 4.5 Haiku (Reasoning)") so one bearing model maps to
//     many source candidates.
//   - Sources use family-then-version with spacing ("Claude 4.5 Haiku") while
//     bearing slugs use hyphens ("claude-haiku-4.5"). We tokenise so word order
//     doesn't matter.
//   - Sources sometimes join family+version ("Qwen3 235B") where the registry
//     splits them ("Qwen 3 235B"). We emit both joined and split atoms.

/** Product-suffix noise removed everywhere. `free` is OpenRouter's free-tier
 *  routing marker (the `:free` variant, shown as "(free)") — a tier, not part
 *  of the model identity, and never present in a benchmark source's name. */
const PRODUCT_NOISE_RE = /\b(preview|experimental|exp|instruct|chat|terminus|speciale|free)\b/gi

/** Effort/reasoning markers — only stripped when inside parentheses. */
const PAREN_NOISE_RE = /\b(reasoning|non-reasoning|nonreasoning|adaptive|low|high|med|medium|max|min|effort|xhigh)\b/gi

/** Date suffixes like "Sep '25" or "Jan 2025". */
const DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*['']?\d{2,4}\b/gi

/** Leading "Vendor: " label that OpenRouter prepends to display names
 *  ("Anthropic: Claude Opus 4.8", "MoonshotAI: Kimi K2.7 Code"). */
const VENDOR_LABEL_RE = /^[^:]*:\s*/

/**
 * Tokens that, when present in a candidate but not in the query, signal a
 * potentially distinct sibling product. Surfaced as flags, not rejections —
 * false suggestions are cheap, false rejections are expensive.
 */
export const SIZE_DISAMBIGUATORS = new Set([
  'nano', 'mini', 'micro', 'small', 'medium', 'large', 'huge', 'plus',
  'lite', 'fast', 'scout', 'flash', 'pro', 'sonnet', 'haiku', 'opus',
  'distill', 'vl', 'omni', 'coder', 'thinking',
])

/**
 * Normalise to whitespace-separated tokens (still as a string).
 * Parens get their content emitted with paren-noise stripped.
 */
export function normaliseModelName(input: string): string {
  return input
    .replace(/\(([^)]*)\)/g, (_match, inner) => ' ' + inner.replace(PAREN_NOISE_RE, ' ') + ' ')
    .replace(DATE_RE, ' ')
    .replace(PRODUCT_NOISE_RE, ' ')
    // Join inter-digit version separators so a hyphenated source version matches
    // the registry's dotted form ("claude-opus-4-8" → "claude-opus-4.8",
    // "claude-3-5-sonnet" → "claude-3.5-sonnet"). Scoped to adjacent 1-2 digit
    // groups bounded by non-digits, so it never glues a date stamp or param
    // suffix to the version ("grok-4-0709", "deepseek-r1-0528" stay split) —
    // those longer digit runs remain distinct tokens. The trailing guard also
    // rejects a second number that's a unit/param count ("LFM2-24B-A2B": "24B"
    // is 24 billion params, not version 2.24), since a version decimal's second
    // half stands alone while a param count is immediately followed by a letter.
    // Runs before the general hyphen→space step below.
    .replace(/(?<![\d.])(\d{1,2})[-_](\d{1,2})(?![\dA-Za-z.])/g, '$1.$2')
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

export type MatchConfidence = 'exact' | 'strong' | 'weak'

/** A registry name is considered `strong` when its tokens cover this fraction
 *  of the source name's tokens with no disambiguator differences. Below it,
 *  the extra (non-flag) tokens are usually a version/family difference. */
const STRONG_SCORE = 0.6

export interface TokenMatch {
  /** Every registry token is present in the source token bag. */
  subset: boolean
  /** |registry| / |source| — 1.0 means identical bags. */
  score: number
  /** Disambiguator tokens in the source but not the registry name. */
  flags: string[]
  confidence: MatchConfidence
}

/**
 * Score a registry name's token bag against a source name's token bag.
 *
 * `modelTokens` is the needle that must be contained in `sourceTokens` (the
 * haystack): external sources add reasoning / effort / size words, so the
 * source name is a superset of the registry name. This relationship holds in
 * both matching directions — only which side is held fixed changes.
 */
export function matchTokens(modelTokens: Set<string>, sourceTokens: Set<string>): TokenMatch {
  const subset = [...modelTokens].every(t => sourceTokens.has(t))
  const score = sourceTokens.size > 0 ? modelTokens.size / sourceTokens.size : 0

  const flags: string[] = []
  if (subset) {
    for (const t of sourceTokens) {
      if (SIZE_DISAMBIGUATORS.has(t) && !modelTokens.has(t)) flags.push(t)
    }
    flags.sort((a, b) => (a === 'distill' ? -1 : b === 'distill' ? 1 : a.localeCompare(b)))
  }

  const confidence: MatchConfidence =
    !subset ? 'weak'
    : flags.length > 0 ? 'weak'
    : score === 1 ? 'exact'
    : score >= STRONG_SCORE ? 'strong'
    : 'weak'

  return { subset, score, flags, confidence }
}

export interface BearingModelMeta {
  slug: string
  name: string
  provider: string
}

export interface AliasCandidate {
  /** Display name as shown by the source. */
  name: string
  /** Source-side slug, when available. */
  slug?: string
}

export interface RankedSourceName extends AliasCandidate {
  score: number
  confidence: MatchConfidence
  /** Non-blocking notes — extra disambiguator tokens the admin should weigh. */
  flags: string[]
}

// Unflagged first, then by score desc, then by tiebreak key for stable order.
function bySuitability<T extends { flags: string[]; score: number }>(
  key: (item: T) => string,
): (a: T, b: T) => number {
  return (a, b) => {
    if ((a.flags.length === 0) !== (b.flags.length === 0)) return a.flags.length === 0 ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    return key(a).localeCompare(key(b))
  }
}

/**
 * Forward direction: given a registry model, rank the source names that could
 * be it. Used by the import form's alias-suggestion panel.
 */
export function rankSourceNames(
  model: BearingModelMeta,
  candidates: AliasCandidate[],
  options: { minQueryTokens?: number } = {},
): RankedSourceName[] {
  const minQueryTokens = options.minQueryTokens ?? 2
  // OpenRouter display names carry a leading "Vendor: " label ("Anthropic:
  // Claude Opus 4.8", "MoonshotAI: Kimi K2.7 Code") that no benchmark source
  // repeats, so the leaked vendor token would fail the subset test against
  // every candidate. Strip the label generically rather than from model.provider
  // — the two can differ ("Moonshot" vs "MoonshotAI"). A vendor word genuinely
  // part of the model name ("MiniMax M2.5", "DeepSeek R1") has no colon and so
  // survives.
  const modelTokens = tokenise(`${model.slug} ${model.name.replace(VENDOR_LABEL_RE, '')}`)
  if (modelTokens.size < minQueryTokens) return []

  const out: RankedSourceName[] = []
  for (const cand of candidates) {
    const m = matchTokens(modelTokens, tokenise(cand.name))
    if (!m.subset) continue
    out.push({ name: cand.name, slug: cand.slug, score: m.score, confidence: m.confidence, flags: m.flags })
  }
  return out.sort(bySuitability(s => s.name))
}

export interface RankedSlug {
  slug: string
  name: string
  score: number
  confidence: MatchConfidence
  flags: string[]
}

/**
 * Reverse direction: given a source model name, rank the registry slugs that
 * could be it. Used by the admin Unmatched UI and by auto-apply.
 */
export function rankSlugs(
  sourceName: string,
  models: BearingModelMeta[],
  options: { minQueryTokens?: number } = {},
): RankedSlug[] {
  const minQueryTokens = options.minQueryTokens ?? 2
  const sourceTokens = tokenise(sourceName)

  const out: RankedSlug[] = []
  for (const model of models) {
    const modelTokens = tokenise(`${model.slug} ${model.name}`)
    if (modelTokens.size < minQueryTokens) continue
    const m = matchTokens(modelTokens, sourceTokens)
    if (!m.subset) continue
    out.push({ slug: model.slug, name: model.name, score: m.score, confidence: m.confidence, flags: m.flags })
  }
  return out.sort(bySuitability(s => s.slug))
}

/**
 * Strict auto-match for re-ingest: returns a slug only when exactly one model
 * is an EXACT token-bag match (identical bags, no disambiguator differences).
 * Anything partial, flagged, or contested returns null and is left for a human
 * to confirm in the Unmatched UI — data integrity over coverage.
 */
export function autoMatchSlug(sourceName: string, models: BearingModelMeta[]): string | null {
  const exact = rankSlugs(sourceName, models).filter(r => r.confidence === 'exact')
  return exact.length === 1 ? exact[0].slug : null
}

/**
 * EcoLogits API-slug matcher. EcoLogits returns hyphenated API slugs with date
 * and `-preview` suffixes ("gemini-3-flash-preview", "claude-3-5-sonnet"), so
 * a Bearing slug can be a subset of the API name OR vice-versa. Returns the
 * best single match (or null) using the shared tokeniser, with bidirectional
 * subset support and a shortest-extra tiebreak.
 */
export function resolveModelName(slug: string, ecoModels: string[]): string | null {
  const slugTokens = tokenise(slug)
  if (slugTokens.size === 0) return null

  // Forward: bearing slug ⊆ eco name (eco adds -preview / date / effort).
  const forward = ecoModels
    .map(name => ({ name, m: matchTokens(slugTokens, tokenise(name)) }))
    .filter(c => c.m.subset)
    .sort((a, b) => {
      // Highest score (fewest extra eco tokens) first; shortest name as tiebreak.
      if (b.m.score !== a.m.score) return b.m.score - a.m.score
      return a.name.length - b.name.length
    })
  if (forward.length > 0) return forward[0].name

  // Reverse: eco name ⊆ bearing slug (eco less specific) — pick most specific.
  const reverse = ecoModels
    .map(name => ({ name, m: matchTokens(tokenise(name), slugTokens) }))
    .filter(c => c.m.subset)
    .sort((a, b) => b.name.length - a.name.length)
  if (reverse.length > 0) return reverse[0].name

  return null
}
