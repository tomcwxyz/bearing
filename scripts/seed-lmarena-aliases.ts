// Seed benchmark_aliases for LMArena → bearing slugs.
//
// Hand-curated from the top-voted LMArena names that match our 30 active models.
// Run dry first (no flag) to print proposed mappings; pass --apply to commit.
//
//   npx tsx scripts/seed-lmarena-aliases.ts          # dry-run
//   npx tsx scripts/seed-lmarena-aliases.ts --apply  # commits via upsertAlias

import { config } from 'dotenv'
config({ path: '.env.local' })
import { upsertAlias } from '../src/lib/benchmarks'

// Each bearing slug maps to one or more LMArena source_model_name values.
// Multiple LMArena variants (e.g. thinking/non-thinking) are fine — they all
// resolve to the same bearing slug, and getLatestBenchmarkScores() averages
// across categories at read time.
const MAPPINGS: Record<string, string[]> = {
  // Anthropic
  'claude-opus-4.7': ['claude-opus-4-7', 'claude-opus-4-7-thinking'],
  'claude-opus-4.6': ['claude-opus-4-6', 'claude-opus-4-6-thinking'],
  'claude-sonnet-4.6': ['claude-sonnet-4-6'],
  'claude-haiku-4.5': ['claude-haiku-4-5-20251001'],

  // OpenAI
  'gpt-5.4': ['gpt-5.4', 'gpt-5.4-high'],
  'gpt-5.4-mini': ['gpt-5.4-mini-high'],
  'gpt-5.4-nano': ['gpt-5.4-nano-high'],

  // Google
  'gemini-3.1-pro': ['gemini-3.1-pro-preview'],
  'gemini-3-flash': ['gemini-3-flash', 'gemini-3-flash (thinking-minimal)'],
  'gemini-2.5-flash-lite': [
    'gemini-2.5-flash-lite-preview-09-2025-no-thinking',
    'gemini-2.5-flash-lite-preview-06-17-thinking',
  ],

  // xAI
  'grok-4': ['grok-4-0709'],

  // DeepSeek
  'deepseek-r1': ['deepseek-r1'],
  'deepseek-r1-0528': ['deepseek-r1-0528'],
  'deepseek-v3.1': ['deepseek-v3.1', 'deepseek-v3.1-thinking'],
  'deepseek-v3.2': ['deepseek-v3.2', 'deepseek-v3.2-thinking'],

  // Alibaba / Qwen
  'qwen3-235b-a22b': [
    'qwen3-235b-a22b',
    'qwen3-235b-a22b-instruct-2507',
    'qwen3-235b-a22b-thinking-2507',
    'qwen3-235b-a22b-no-thinking',
  ],
  'qwen-2.5-72b': ['qwen2.5-72b-instruct'],
  'qwen3.5-397b': ['qwen3.5-397b-a17b'],

  // Meta
  'llama-4-maverick': ['llama-4-maverick-17b-128e-instruct'],

  // MiniMax
  'minimax-m2.5': ['minimax-m2.5'],
  'minimax-m2.7': ['minimax-m2.7'],

  // Moonshot AI / Kimi
  'kimi-k2': ['kimi-k2-0711-preview', 'kimi-k2-0905-preview', 'kimi-k2-thinking-turbo'],
  'kimi-k2.5': ['kimi-k2.5-thinking', 'kimi-k2.5-instant'],

  // Mistral
  'mistral-ocr': ['pixtral-large-2411'],
  'devstral': ['devstral-medium-2507', 'devstral-2'],

  // GreenPT (rebadges)
  'greenpt-greenr': ['gpt-oss-120b'],
  'greenpt-greenl': ['mistral-small-3.1-24b-instruct-2503'],

  // No confident LMArena match — left curated:
  //   ibm-granite-3.3 (only granite-3.0/3.1 on arena)
  //   codestral-25.01 (not on arena)
  //   mistral-medium-3 (mistral-medium-2505/2508 not the same family)
}

async function main() {
  const apply = process.argv.includes('--apply')
  let count = 0
  for (const [bearingSlug, names] of Object.entries(MAPPINGS)) {
    for (const name of names) {
      console.log(`  ${apply ? 'APPLY' : 'DRY  '}  ${bearingSlug}  ←  lmarena::${name}`)
      if (apply) {
        await upsertAlias('lmarena', name, bearingSlug, 'seeded 2026-05-04')
      }
      count++
    }
  }
  console.log(`\n${apply ? 'Wrote' : 'Would write'} ${count} alias rows.`)
}
main().catch(err => {
  console.error(err)
  process.exit(1)
})
