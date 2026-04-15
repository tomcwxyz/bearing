/**
 * Test script: calls every model via the compare pathway.
 * Tests OpenRouter models AND direct provider models (GreenPT, Mistral, NVIDIA NIM).
 * Sends a simple prompt and reports: success/fail, response length, latency, errors.
 *
 * Usage: npx tsx scripts/test-compare-models.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { neon } from '@neondatabase/serverless'
import { callModel, callDirectProvider, DIRECT_PROVIDERS } from '../src/lib/openrouter'

const TEST_PROMPT = 'In exactly one sentence, explain what a neural network is.'

interface TestResult {
  slug: string
  name: string
  provider: string
  modelId: string
  status: 'ok' | 'error' | 'empty' | 'skip'
  responseLength: number
  latencyMs: number
  error?: string
  preview?: string
}

function formatResult(r: TestResult): string {
  const icon = r.status === 'ok' ? 'OK' : r.status === 'skip' ? 'SKIP' : r.status === 'error' ? 'ERR' : 'EMPTY'
  const pad = r.slug.padEnd(25)
  const prov = r.provider.padEnd(12)
  const latency = r.status === 'skip' ? '   -  ' : `${(r.latencyMs / 1000).toFixed(1)}s`.padStart(6)
  const len = r.status === 'ok' ? `${r.responseLength} chars` : ''
  const detail = r.error || r.preview || ''
  return `  [${icon.padEnd(5)}] ${pad} ${prov} ${latency}  ${len.padEnd(12)} ${detail.slice(0, 70)}`
}

async function testOpenRouterModel(model: { slug: string; name: string; openrouter_id: string }): Promise<TestResult> {
  const messages = [{ role: 'user', content: TEST_PROMPT }]
  const start = Date.now()
  const result = await callModel(model.openrouter_id, messages)
  const latencyMs = Date.now() - start

  const base = { slug: model.slug, name: model.name, provider: 'OpenRouter', modelId: model.openrouter_id }

  if (result.error) return { ...base, status: 'error', responseLength: 0, latencyMs, error: result.error }
  if (!result.text?.trim()) return { ...base, status: 'empty', responseLength: 0, latencyMs }
  return { ...base, status: 'ok', responseLength: result.text.length, latencyMs, preview: result.text.slice(0, 120).replace(/\n/g, ' ') }
}

async function testDirectModel(slug: string, name: string): Promise<TestResult> {
  const provider = DIRECT_PROVIDERS[slug]
  const base = { slug, name, provider: provider.name, modelId: provider.modelId }

  // Check if API key is set
  if (!process.env[provider.apiKeyEnv]) {
    return { ...base, status: 'skip', responseLength: 0, latencyMs: 0, error: `${provider.apiKeyEnv} not set` }
  }

  const messages = [{ role: 'user', content: TEST_PROMPT }]
  const start = Date.now()
  const result = await callDirectProvider(slug, messages)
  const latencyMs = Date.now() - start

  if (result.error) return { ...base, status: 'error', responseLength: 0, latencyMs, error: result.error }
  if (!result.text?.trim()) return { ...base, status: 'empty', responseLength: 0, latencyMs }
  return { ...base, status: 'ok', responseLength: result.text.length, latencyMs, preview: result.text.slice(0, 120).replace(/\n/g, ' ') }
}

async function main() {
  const sql = neon(process.env.NEON_DATABASE_URL!)

  // 1. Test OpenRouter models
  const orModels = await sql`
    SELECT slug, name, openrouter_id FROM models
    WHERE openrouter_id IS NOT NULL ORDER BY slug
  ` as Array<{ slug: string; name: string; openrouter_id: string }>

  console.log(`\n=== Testing ${orModels.length} OpenRouter models ===\n`)
  console.log('Prompt:', TEST_PROMPT)
  console.log('─'.repeat(100))

  const orResults: TestResult[] = []
  const CONCURRENCY = 4
  for (let i = 0; i < orModels.length; i += CONCURRENCY) {
    const batch = orModels.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(batch.map(testOpenRouterModel))
    for (const r of batchResults) {
      orResults.push(r)
      console.log(formatResult(r))
    }
  }

  // 2. Test direct provider models
  const directSlugs = Object.keys(DIRECT_PROVIDERS)
  const directModels = await sql`
    SELECT slug, name FROM models WHERE slug = ANY(${directSlugs}) ORDER BY slug
  ` as Array<{ slug: string; name: string }>

  console.log(`\n=== Testing ${directModels.length} direct provider models ===\n`)
  console.log('─'.repeat(100))

  const directResults: TestResult[] = []
  for (const m of directModels) {
    const r = await testDirectModel(m.slug, m.name)
    directResults.push(r)
    console.log(formatResult(r))
  }

  // 3. Summary
  const all = [...orResults, ...directResults]
  const ok = all.filter(r => r.status === 'ok')
  const errors = all.filter(r => r.status === 'error')
  const empty = all.filter(r => r.status === 'empty')
  const skipped = all.filter(r => r.status === 'skip')

  console.log('\n' + '─'.repeat(100))
  console.log(`\nTotal: ${all.length} models — ${ok.length} OK, ${errors.length} errors, ${empty.length} empty, ${skipped.length} skipped`)

  if (errors.length > 0) {
    console.log('\nErrors:')
    for (const r of errors) console.log(`  ${r.slug} (${r.provider}/${r.modelId}): ${r.error}`)
  }

  if (skipped.length > 0) {
    console.log('\nSkipped (missing API key):')
    for (const r of skipped) console.log(`  ${r.slug}: ${r.error}`)
  }

  const avgLatency = ok.length > 0 ? ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length : 0
  console.log(`\nAverage latency (successful): ${(avgLatency / 1000).toFixed(1)}s`)
}

main().catch(console.error)
