/**
 * Deterministic model identity reconciliation.
 *
 * This does not "guess" which model ran an evaluation. It proposes identities
 * using version/family/provider gates followed by lexical similarity. Typos
 * and otherwise fuzzy names are review-only. An exact normalised identity may
 * be auto-linked ONLY with no variant/revision/qualifier ambiguity and a
 * unique registry candidate (the caller enforces uniqueness).
 *
 * Keep this dependency-free: it runs for the entire Discover catalogue.
 */
export interface IdentityInput {
  name: string
  provider?: string
}

export interface IdentityAssessment {
  score: number
  autoEligible: boolean
  flags: string[]
  reasons: string[]
}

const FAMILY_RE = /(?:^|[^a-z])(claude|gpt|gemini|gemma|grok|mistral|codestral|devstral|pixtral|qwen|deepseek|kimi|llama|minimax|lfm|olmo|phi|command|jamba)(?=[^a-z]|$)/i
const PROVIDERS: Record<string, string> = {
  claude: 'anthropic', gpt: 'openai', gemini: 'google', gemma: 'google',
  grok: 'xai', mistral: 'mistral', codestral: 'mistral',
  devstral: 'mistral', pixtral: 'mistral', qwen: 'alibaba',
  deepseek: 'deepseek', kimi: 'moonshot', llama: 'meta',
  minimax: 'minimax', lfm: 'liquid', olmo: 'allenai',
  phi: 'microsoft', command: 'cohere', jamba: 'ai21',
}
const FAMILY_GROUPS = [
  ['haiku', 'sonnet', 'opus'],
  ['large', 'medium', 'small'],
  ['mini', 'nano', 'micro'],
  ['flash', 'pro'],
  ['maverick', 'scout'],
  ['coder', 'vl'],
]
const REVIEW_MARKERS = new Set([
  'preview', 'experimental', 'reasoning', 'nonreasoning', 'thinking',
  'xhigh', 'high', 'medium', 'low', 'max', 'minimal', 'adaptive',
  'distill', 'vl', 'coder', 'instruct', 'vision', 'turbo',
])
const NOISE = new Set(['by', 'model', 'api', 'ai', 'latest', 'chat', 'free', 'effort', 'mode'])
const DAY_MONTH = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*'?\d{2,4}\b/gi

export function familyOf(name: string): string | null {
  return name.toLowerCase().match(FAMILY_RE)?.[1] ?? null
}

function providerOf(input: IdentityInput, family: string | null): string | null {
  const p = (input.provider ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (p) {
    const aliases: Record<string, string> = {
      mistralai: 'mistral', moonshotai: 'moonshot', zai: 'zai',
      googledeepmind: 'google', xai: 'xai', alibabacloud: 'alibaba',
      liquidai: 'liquid', metaplatforms: 'meta',
    }
    return aliases[p] ?? p
  }
  return family ? PROVIDERS[family] ?? null : null
}

function normalised(name: string): string {
  return name.toLowerCase()
    .replace(/^[^:]+:\s*/, '')
    .replace(DAY_MONTH, ' ')
    .replace(/(\d{1,2})[-_](\d{1,2})(?![a-z0-9.])/g, '$1.$2')
    .replace(/([a-z]{2,})(\d)/g, '$1 $2')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function tokensOf(name: string): string[] {
  return normalised(name).split(' ').filter(t => t && !NOISE.has(t))
}

function revision(name: string): string | null {
  const stripped = name.replace(DAY_MONTH, ' ')
  // Revision suffixes are identifiers, not the model's main version:
  // DeepSeek R1 0528 and R1 0120 must never auto-map to one another.
  const m = stripped.match(/(?:^|[\s_-])(\d{4,8})(?=$|[\s_-])/)
  return m?.[1] ?? null
}

function versionOf(name: string): string | null {
  const withoutDates = name.replace(DAY_MONTH, ' ')
  const m = normalised(withoutDates).match(/(?:^|\s|[a-z])(\d{1,2}(?:\.\d{1,2})?)(?=$|\s|[a-z])/)
  return m?.[1] ?? null
}

function qualifiers(tokens: string[]): Set<string> {
  return new Set(tokens.filter(t => REVIEW_MARKERS.has(t) || FAMILY_GROUPS.some(g => g.includes(t))))
}

function diceBigrams(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const grams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }
  const x = grams(a), y = grams(b)
  let common = 0
  for (const [g, count] of x) common += Math.min(count, y.get(g) ?? 0)
  return (2 * common) / (a.length + b.length - 2)
}

function similarWords(a: string[], b: string[]): number {
  const common = new Set(a.filter(t => b.includes(t))).size
  const denom = new Set([...a, ...b]).size
  return denom ? common / denom : 0
}

export function compareModelIdentity(target: IdentityInput, candidate: IdentityInput): IdentityAssessment | null {
  const tName = normalised(target.name)
  const sName = normalised(candidate.name)
  const tFamily = familyOf(tName), sFamily = familyOf(sName)
  if (tFamily && sFamily && tFamily !== sFamily) return null
  const tProvider = providerOf(target, tFamily), sProvider = providerOf(candidate, sFamily)
  if (tProvider && sProvider && tProvider !== sProvider) return null

  const tVersion = versionOf(tName), sVersion = versionOf(sName)
  if (tVersion && sVersion && tVersion !== sVersion) return null
  // Do not fuzz models lacking a recognisable family or matching version;
  // using token proximity alone risks cross-generation benchmark contamination.
  if (!tFamily || !sFamily || !tVersion || !sVersion) return null

  const tTokens = tokensOf(tName), sTokens = tokensOf(sName)
  const ta = qualifiers(tTokens), sa = qualifiers(sTokens)
  for (const group of FAMILY_GROUPS) {
    const t = group.filter(q => ta.has(q))
    const s = group.filter(q => sa.has(q))
    if (t.length && s.length && !t.some(q => s.includes(q))) return null
  }

  const flags: string[] = []
  const reasons = ['same model family', 'same model version']
  const tRevision = revision(tName), sRevision = revision(sName)
  if (tRevision !== sRevision && (tRevision || sRevision)) flags.push('revision needs review')
  const onlySource = [...sa].filter(q => !ta.has(q))
  const onlyTarget = [...ta].filter(q => !sa.has(q))
  for (const q of [...onlySource, ...onlyTarget]) {
    if (!flags.includes('variant: ' + q)) flags.push('variant: ' + q)
  }
  // Provider mismatch is a hard stop; lack of provider metadata is not an
  // invitation to silently auto-link a candidate.
  if (!tProvider || !sProvider) flags.push('provider unverified')

  const meaningful = (a: string[]) => a.filter(t => !REVIEW_MARKERS.has(t))
  const tCore = meaningful(tTokens), sCore = meaningful(sTokens)
  const jaccard = similarWords(tCore, sCore)
  const dice = diceBigrams([...tCore].sort().join(' '), [...sCore].sort().join(' '))
  const score = Math.round((0.6 * jaccard + 0.4 * dice) * 1000) / 1000
  if (score < 0.62) return null
  if (jaccard < 1) flags.push('fuzzy name — review')
  if (score === 1 && flags.length === 0) reasons.push('identical canonical identity')
  else reasons.push('similar name; approval required')

  return { score, flags, reasons, autoEligible: score === 1 && flags.length === 0 }
}
