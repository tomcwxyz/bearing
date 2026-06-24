/**
 * Tuning test: runs a battery of varied user prompts through the real
 * classification + scoring pipeline (no browser, no DB writes) and prints
 * the top recommendations. Used to spot-check whether Bearing is
 * recommending sensible models for sensible prompts.
 *
 * Usage: npx tsx scripts/test-recommendations.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync, writeFileSync } from 'fs'
import { classifyTask } from '../src/lib/classification'
import { scoreModels } from '../src/lib/scoring'
import { getLatestBenchmarkScores } from '../src/lib/benchmarks'
import type { Factor } from '../src/lib/registry'

const DEFAULT_PRIORITIES: Factor[] = [
  'quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed',
]

interface Prompt {
  id: number
  category: string
  text: string
  // human expectation — what a sensible top recommendation looks like
  expect: string
}

// One prompt's run: the prompt plus its classification and the top-3 scored models.
type RunResult = Prompt & {
  classification: Awaited<ReturnType<typeof classifyTask>>
  top3: Array<{
    slug: string; name: string; provider: string; tier: string
    weightedScore: number; estimatedCost: number
  }>
}

const PROMPTS: Prompt[] = [
  // === code ===
  { id: 1,  category: 'code-hard',     text: 'Refactor a 5,000-line legacy Python service into modular packages with full type hints and 90% test coverage.', expect: 'Top-tier coder (Opus 4.7 / Sonnet 4.6 / GPT-5.4)' },
  { id: 2,  category: 'code-simple',   text: 'Write a regex in JavaScript that matches UK postcodes.', expect: 'Cheap fast model (Haiku / Gemini Flash / Mistral Small)' },
  { id: 3,  category: 'code-debug',    text: 'I have a flaky integration test in our Node.js CI; help me identify likely race conditions.', expect: 'Strong reasoner (Opus / Sonnet / o-series)' },
  { id: 4,  category: 'code-frontend', text: 'Build a React + Tailwind dashboard component that visualises time-series metrics with brushing and zoom.', expect: 'Sonnet 4.6 / Opus 4.7 (frontend strength)' },
  // === summarise ===
  { id: 5,  category: 'sum-short',     text: 'Summarise this 3-paragraph press release into a tweet.', expect: 'Haiku / Flash / cheapest decent' },
  { id: 6,  category: 'sum-long',      text: 'Summarise a 200-page board report into a 2-page exec brief, preserving numerical figures exactly.', expect: 'Long-context model (Gemini 2.5 Pro / Sonnet)' },
  { id: 7,  category: 'sum-meeting',   text: 'Summarise weekly Zoom meeting transcripts (~30k tokens each) into action items.', expect: 'Haiku / Flash long-context, recurring → cost-sensitive' },
  // === extract ===
  { id: 8,  category: 'extract-pdf',   text: 'Extract line items, totals and VAT from scanned PDF invoices.', expect: 'Vision-capable (Gemini / Sonnet / GPT-5.4) — likely pipeline' },
  { id: 9,  category: 'extract-text',  text: 'Pull all email addresses and phone numbers out of a 50-page contract.', expect: 'Cheap structured-output model' },
  { id: 10, category: 'extract-struct',text: 'Convert messy free-text product reviews into JSON with sentiment, topics and aspect ratings.', expect: 'Structured-output mid-tier' },
  // === generate ===
  { id: 11, category: 'gen-creative',  text: 'Write a 1500-word short story in the style of Ursula K Le Guin about an AI that learns to garden.', expect: 'Creative-writing top model (Opus / Sonnet)' },
  { id: 12, category: 'gen-marketing', text: 'Draft 5 LinkedIn posts announcing a new B2B SaaS feature, varied in tone.', expect: 'Mid-tier (Sonnet / Gemini Pro / GPT-5.4 mini)' },
  { id: 13, category: 'gen-email',     text: 'Write a polite follow-up email to a client who has not replied for 2 weeks.', expect: 'Cheap fast (Haiku / Flash)' },
  { id: 14, category: 'gen-report',    text: 'Generate a 20-page market-research report on the UK ed-tech sector with citations and charts described.', expect: 'Strong + long-context (Opus / Gemini 2.5 Pro)' },
  // === analyse ===
  { id: 15, category: 'analyse-data',  text: 'Analyse this CSV of 10k customer transactions and identify churn predictors.', expect: 'Strong reasoner with code/tools (Opus / GPT-5.4)' },
  { id: 16, category: 'analyse-legal', text: 'Review a 40-page commercial lease and flag clauses that are unusual or risky for the tenant.', expect: 'High-quality + long-context (Opus / Sonnet / Gemini Pro)' },
  { id: 17, category: 'analyse-math',  text: 'Solve this system of nonlinear PDEs symbolically and explain the steps.', expect: 'Reasoning model (o-series / DeepSeek R1 / Opus)' },
  { id: 18, category: 'analyse-strat', text: 'Help me think through whether to expand into the German market — pros, cons, risks.', expect: 'Strategic reasoner (Opus / Sonnet)' },
  // === translate ===
  { id: 19, category: 'translate',     text: 'Translate this technical white paper from English into Brazilian Portuguese, preserving terminology.', expect: 'Multilingual top model (Gemini / GPT / DeepSeek)' },
  { id: 20, category: 'translate-bulk',text: 'Translate 200 short product descriptions from English to French daily.', expect: 'Cheap multilingual (Mistral / Haiku / Flash)' },
  // === conversation ===
  { id: 21, category: 'convo-tutor',   text: 'Build a chatbot that tutors GCSE maths students step-by-step.', expect: 'Mid-tier with reasoning (Sonnet / Gemini Pro / GPT-5.4 mini)' },
  { id: 22, category: 'convo-support', text: 'Power a customer-support chatbot that handles refund and order-status queries.', expect: 'Cheap + tools (Haiku / Flash / Mistral)' },
  { id: 23, category: 'convo-therapy', text: 'A reflective journaling companion that asks gentle follow-up questions.', expect: 'Haiku / Sonnet (warmth + safety)' },
  // === vision ===
  { id: 24, category: 'vision-classify', text: 'Classify product photos into 30 categories from an e-commerce catalogue.', expect: 'Vision capable cheap (Gemini Flash / Haiku vision)' },
  { id: 25, category: 'vision-ocr',    text: 'OCR handwritten doctor notes from scanned charts into searchable text.', expect: 'Vision + accuracy (Gemini Pro / Sonnet / GPT-5.4)' },
  // === pipelines ===
  { id: 26, category: 'pipeline-1',    text: 'Extract text from these 100 scanned receipts then categorise the spending and produce a monthly summary.', expect: 'Pipeline: vision-extract → analyse → summarise' },
  { id: 27, category: 'pipeline-2',    text: 'Translate this Japanese research paper into English then write a 1-page lay summary.', expect: 'Pipeline: translate → summarise' },
  { id: 28, category: 'pipeline-3',    text: 'Read our codebase, generate API docs, and translate them into Spanish.', expect: 'Pipeline: code → generate → translate' },
  // === edge cases ===
  { id: 29, category: 'vague',         text: 'Help me with AI stuff.', expect: 'Should ask for clarification' },
  { id: 30, category: 'privacy-heavy', text: 'Process patient medical records to identify high-risk cases — must run on-prem with zero data egress.', expect: 'Local / open-weight model (Llama / Mistral / Granite)' },
  { id: 31, category: 'multilingual',  text: 'Build a chatbot that handles English, Arabic, Mandarin and Swahili customer queries.', expect: 'Multilingual capable (Gemini / GPT-5.4 / DeepSeek)' },
  { id: 32, category: 'tools-agent',   text: 'Build an agent that can browse the web, run code, and call our internal API to schedule meetings.', expect: 'Tool-use strong (Sonnet / Opus / GPT-5.4)' },
  { id: 33, category: 'budget',        text: 'Classify a million tweets per day for sentiment — keep cost under $50/month total.', expect: 'Cheapest viable (Haiku / Flash / Mistral / open-weight)' },
  { id: 34, category: 'realtime',      text: 'A voice assistant that responds in under 200ms.', expect: 'Fast tier (Flash / Haiku / Mistral Small)' },
]

function topN<T extends { name: string; provider: string; tier: string; weightedScore: number; estimatedCost: number }>(arr: T[], n: number) {
  return arr.slice(0, n).map(m => `${m.name} (${m.provider}, ${m.tier}, w=${m.weightedScore.toFixed(3)}, $${m.estimatedCost.toFixed(4)})`)
}

// Simple CLI parsing — `--diff <baseline-path>` enables diff mode against a locked baseline.
const diffFlagIndex = process.argv.indexOf('--diff')
const diffBaselinePath = diffFlagIndex !== -1 ? process.argv[diffFlagIndex + 1] : undefined

interface BaselineEntry {
  id: number
  category: string
  top3: Array<{ slug: string; name: string }>
}

function loadBaseline(path: string): Map<number, BaselineEntry> {
  const raw = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw) as BaselineEntry[]
  const map = new Map<number, BaselineEntry>()
  for (const entry of parsed) map.set(entry.id, entry)
  return map
}

// Compare two ordered slug lists. Returns null when identical (same set + same order),
// otherwise a human-readable diff string built from added/removed/reordered slugs.
function diffTop3(baseSlugs: string[], currentSlugs: string[]): string | null {
  const baseSet = new Set(baseSlugs)
  const currSet = new Set(currentSlugs)
  const added = currentSlugs.filter(s => !baseSet.has(s))
  const removed = baseSlugs.filter(s => !currSet.has(s))
  const sameSet = added.length === 0 && removed.length === 0
  const sameOrder = sameSet && baseSlugs.every((s, i) => s === currentSlugs[i])
  if (sameOrder) return null
  const parts: string[] = []
  for (const slug of added) parts.push(`+${slug}`)
  for (const slug of removed) parts.push(`-${slug}`)
  if (sameSet && !sameOrder) {
    parts.push(`~${baseSlugs.join(',')}→${currentSlugs.join(',')}`)
  }
  return parts.join(' ')
}

async function main() {
  const benchmarkScores = await getLatestBenchmarkScores().catch(() => undefined)
  console.log(`Benchmark scores loaded: ${benchmarkScores ? benchmarkScores.size + ' entries' : 'NONE (curated only)'}`)
  console.log(`BENCHMARK_BLEND = ${process.env.BENCHMARK_BLEND ?? '0'}`)
  console.log('=' .repeat(100))

  const results: RunResult[] = []

  for (const p of PROMPTS) {
    try {
      const cls = await classifyTask(p.text)
      const scored = scoreModels({
        taskType: cls.task_type,
        complexity: cls.complexity,
        inputLength: cls.input_length,
        needsVision: cls.needs_vision,
        needsTools: cls.needs_tools,
        needsCode: cls.needs_code,
        needsReasoning: cls.needs_reasoning,
        dataSensitivity: cls.data_sensitivity,
        latencyTarget: cls.latency_target,
        volume: cls.volume,
        needsLongContext: cls.needs_long_context,
        needsMultilingual: cls.needs_multilingual,
        isAgentic: cls.is_agentic,
        outputLength: cls.output_length,
        priorityOrder: DEFAULT_PRIORITIES,
        benchmarkScores,
      })
      const top3 = topN(scored, 3)
      console.log(`\n#${p.id} [${p.category}] complexity=${cls.complexity} type=${cls.task_type}/${cls.task_subtype ?? '-'} in=${cls.input_length} out=${cls.output_length} v=${cls.needs_vision?'Y':'-'} t=${cls.needs_tools?'Y':'-'} c=${cls.needs_code?'Y':'-'} r=${cls.needs_reasoning?'Y':'-'} ml=${cls.needs_multilingual?'Y':'-'} ag=${cls.is_agentic?'Y':'-'} lc=${cls.needs_long_context?'Y':'-'} sens=${cls.data_sensitivity} lat=${cls.latency_target} vol=${cls.volume} conf=${cls.confidence} clarify=${cls.clarification_needed} pipeline=${cls.pipeline_recommended}`)
      console.log(`  prompt:  ${p.text.slice(0, 110)}${p.text.length > 110 ? '…' : ''}`)
      console.log(`  expect:  ${p.expect}`)
      console.log(`  top 3:`)
      for (const m of top3) console.log(`    - ${m}`)
      if (cls.pipeline_stages) {
        console.log(`  pipeline stages: ${cls.pipeline_stages.map(s => `${s.stage}:${s.task_type}`).join(' → ')}`)
      }
      results.push({ ...p, classification: cls, top3: scored.slice(0, 3).map(m => ({ slug: m.slug, name: m.name, provider: m.provider, tier: m.tier, weightedScore: m.weightedScore, estimatedCost: m.estimatedCost })) })
    } catch (err) {
      console.error(`#${p.id} FAILED: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (diffBaselinePath) {
    // Diff mode: compare current run's top-3 slugs against locked baseline. Informational only.
    const baseline = loadBaseline(diffBaselinePath)
    console.log('\n\n' + '='.repeat(100))
    console.log(`DIFF vs ${diffBaselinePath}`)
    console.log('='.repeat(100))
    let changed = 0
    let unchanged = 0
    for (const r of results) {
      const base = baseline.get(r.id)
      if (!base) {
        console.log(`#${r.id} [${r.category}] (not in baseline)`)
        continue
      }
      const baseSlugs = base.top3.map(m => m.slug)
      const currSlugs = r.top3.map((m: { slug: string }) => m.slug)
      const diff = diffTop3(baseSlugs, currSlugs)
      if (diff === null) {
        console.log(`= #${r.id}`)
        unchanged++
      } else {
        console.log(`#${r.id} [${r.category}] ${diff}`)
        changed++
      }
    }
    const total = changed + unchanged
    console.log('='.repeat(100))
    console.log(`${changed}/${total} prompts changed top-3, ${unchanged} unchanged`)
  } else {
    // Default mode: write JSON snapshot for downstream analysis / future baselines.
    writeFileSync('test-recommendations-output.json', JSON.stringify(results, null, 2))
    console.log('\n\nWrote test-recommendations-output.json')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
