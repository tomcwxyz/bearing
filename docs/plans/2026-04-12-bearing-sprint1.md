# Bearing Sprint 1: Core Recommend Flow — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the complete Recommend flow — describe task, classify, set priorities, get ranked results, select a model — with data collection to Neon Postgres.

**Architecture:** Server-first Next.js 15 App Router. All logic in server actions. Pure scoring function against a static JSON registry. Haiku for classification and reasoning. Neon for persistence.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, @anthropic-ai/sdk, @neondatabase/serverless, Vercel

**Design doc:** `docs/plans/2026-04-12-bearing-design.md`
**Spec:** `modelpicker-spec-v1.2.md`
**Registry:** `bearing-registry-v0.2.0.json`

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `.env.local` (gitignored)
- Modify: `.gitignore`

**Step 1: Initialise Next.js project**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack
```

Accept defaults. This scaffolds into the current directory.

**Step 2: Add dependencies**

Run:
```bash
npm install @anthropic-ai/sdk @neondatabase/serverless
```

**Step 3: Create .env.local**

Create `.env.local` with placeholder keys:
```
ANTHROPIC_API_KEY=sk-ant-xxx
NEON_DATABASE_URL=postgresql://xxx
OPENROUTER_API_KEY=sk-or-xxx
```

**Step 4: Update .gitignore**

Add to existing `.gitignore`:
```
.env.local
.env*.local
```

**Step 5: Verify it runs**

Run: `npm run dev`
Expected: Dev server starts on localhost:3000

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 project with dependencies"
```

---

## Task 2: Registry Types and Loader

**Files:**
- Create: `src/data/bearing-registry.json` (copy from project root)
- Create: `src/lib/registry.ts`
- Create: `src/lib/__tests__/registry.test.ts`

**Step 1: Copy registry into src/data**

Copy `bearing-registry-v0.2.0.json` to `src/data/bearing-registry.json`.

**Step 2: Write the failing test**

```typescript
// src/lib/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest'
import { getRegistry, getModel, getAllModels, getModelSlugs } from '../registry'

describe('registry', () => {
  it('loads the registry with metadata', () => {
    const registry = getRegistry()
    expect(registry.meta.name).toBe('Bearing Model Registry')
    expect(registry.meta.version).toBe('0.2.0')
  })

  it('returns a model by slug', () => {
    const model = getModel('claude-sonnet-4.6')
    expect(model).toBeDefined()
    expect(model!.name).toBe('Claude Sonnet 4.6')
    expect(model!.provider).toBe('Anthropic')
  })

  it('returns undefined for unknown slug', () => {
    const model = getModel('nonexistent-model')
    expect(model).toBeUndefined()
  })

  it('returns all models as an array', () => {
    const models = getAllModels()
    expect(models.length).toBe(17)
    expect(models[0]).toHaveProperty('slug')
    expect(models[0]).toHaveProperty('name')
  })

  it('returns all model slugs', () => {
    const slugs = getModelSlugs()
    expect(slugs).toContain('claude-sonnet-4.6')
    expect(slugs).toContain('ibm-granite-3.3')
    expect(slugs.length).toBe(17)
  })
})
```

**Step 3: Install vitest and run test to verify it fails**

Run:
```bash
npm install -D vitest @vitejs/plugin-react
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Run: `npm test`
Expected: FAIL — module not found

**Step 4: Write registry types and loader**

```typescript
// src/lib/registry.ts
import registryData from '@/data/bearing-registry.json'

export type Factor = 'cost' | 'speed' | 'quality' | 'privacy' | 'sustainability' | 'transparency' | 'capability'

export type TaskType = 'summarise' | 'generate' | 'extract' | 'code' | 'analyse' | 'translate' | 'conversation' | 'vision' | 'other'

export type Tier = 'flagship' | 'balanced' | 'budget' | 'reasoning' | 'open_source_flagship' | 'open_source_balanced' | 'sustainable_balanced' | 'sustainable_flagship' | 'enterprise_transparent'

export type Capability = 'vision' | 'tools' | 'code' | 'long_context' | 'extended_thinking' | 'structured_output' | 'multilingual' | 'audio' | 'video' | 'computer_use'

export interface ModelPricing {
  input_per_1m: number
  output_per_1m: number
}

export interface ModelTransparency {
  open_weights: number
  open_training_data: number
  open_methodology: number
  licence_openness: number
  provider_disclosure: number
  fmti_company_score: number | null
  transparency_score: number
  notes: string
}

export interface ModelSustainability {
  inference_energy: number | null
  training_footprint: number | null
  provider_infrastructure: number | null
  sustainability_score: number
  notes: string
}

export interface Model {
  slug: string
  name: string
  provider: string
  tier: Tier
  pricing: ModelPricing
  context_window: number
  capabilities: Capability[]
  strengths: string[]
  weaknesses: string[]
  task_fitness: Record<string, number>
  speed_score: number
  privacy_score: number
  transparency: ModelTransparency
  sustainability: ModelSustainability
}

export interface Registry {
  meta: {
    name: string
    version: string
    updated: string
    maintainer: string
    license: string
    notes: string
  }
  scoring_methodology: {
    factors: Record<string, string>
    default_weights: Record<Factor, number>
  }
  models: Record<string, Model>
}

export function getRegistry(): Registry {
  const data = registryData as any
  // Inject slugs into model objects
  const models: Record<string, Model> = {}
  for (const [slug, model] of Object.entries(data.models)) {
    models[slug] = { slug, ...(model as any) }
  }
  return { ...data, models }
}

export function getModel(slug: string): Model | undefined {
  const registry = getRegistry()
  return registry.models[slug]
}

export function getAllModels(): Model[] {
  const registry = getRegistry()
  return Object.entries(registry.models).map(([slug, model]) => ({
    ...model,
    slug,
  }))
}

export function getModelSlugs(): string[] {
  return Object.keys(registryData.models)
}

export function getDefaultWeights(): Record<Factor, number> {
  return registryData.scoring_methodology.default_weights as Record<Factor, number>
}
```

**Step 5: Run tests**

Run: `npm test`
Expected: All 5 tests PASS

**Step 6: Commit**

```bash
git add src/lib/registry.ts src/lib/__tests__/registry.test.ts src/data/bearing-registry.json vitest.config.ts
git commit -m "feat: add typed registry loader with tests"
```

---

## Task 3: Priority Weight Conversion

**Files:**
- Create: `src/lib/weights.ts`
- Create: `src/lib/__tests__/weights.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/weights.test.ts
import { describe, it, expect } from 'vitest'
import { priorityToWeights } from '../weights'
import type { Factor } from '../registry'

describe('priorityToWeights', () => {
  it('returns default weights when given default priority order', () => {
    const defaultOrder: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const weights = priorityToWeights(defaultOrder)

    // All weights should sum to ~1.0
    const sum = Object.values(weights).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)

    // Quality is 1st so should be highest
    expect(weights.quality).toBeGreaterThan(weights.speed)
  })

  it('boosts the top-ranked factor', () => {
    const privacyFirst: Factor[] = ['privacy', 'quality', 'capability', 'cost', 'transparency', 'sustainability', 'speed']
    const weights = priorityToWeights(privacyFirst)

    expect(weights.privacy).toBeGreaterThan(weights.quality)
    expect(weights.privacy).toBeGreaterThan(weights.cost)
  })

  it('weights always sum to 1.0', () => {
    const order: Factor[] = ['speed', 'cost', 'sustainability', 'transparency', 'privacy', 'capability', 'quality']
    const weights = priorityToWeights(order)
    const sum = Object.values(weights).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('last-ranked factor gets lowest weight', () => {
    const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
    const weights = priorityToWeights(order)
    const values = Object.entries(weights).sort((a, b) => b[1] - a[1])
    expect(values[values.length - 1][0]).toBe('speed')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/weights.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/lib/weights.ts
import type { Factor } from './registry'
import { getDefaultWeights } from './registry'

const RANK_MULTIPLIERS = [2.0, 1.5, 1.2, 1.0, 0.8, 0.6, 0.4]

export function priorityToWeights(priorityOrder: Factor[]): Record<Factor, number> {
  const defaults = getDefaultWeights()

  // Apply multiplier based on rank position
  const raw: Record<string, number> = {}
  for (let i = 0; i < priorityOrder.length; i++) {
    const factor = priorityOrder[i]
    raw[factor] = defaults[factor] * RANK_MULTIPLIERS[i]
  }

  // Normalise to sum to 1.0
  const total = Object.values(raw).reduce((a, b) => a + b, 0)
  const weights: Record<string, number> = {}
  for (const [factor, value] of Object.entries(raw)) {
    weights[factor] = value / total
  }

  return weights as Record<Factor, number>
}
```

**Step 4: Run tests**

Run: `npm test -- src/lib/__tests__/weights.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/lib/weights.ts src/lib/__tests__/weights.test.ts
git commit -m "feat: add priority-to-weight conversion with tests"
```

---

## Task 4: Scoring Engine

**Files:**
- Create: `src/lib/scoring.ts`
- Create: `src/lib/__tests__/scoring.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/scoring.test.ts
import { describe, it, expect } from 'vitest'
import { scoreModels } from '../scoring'
import type { Factor } from '../registry'

const defaultPriority: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']

describe('scoreModels', () => {
  it('returns scored models sorted by weightedScore descending', () => {
    const results = scoreModels({
      taskType: 'code',
      complexity: 'moderate',
      inputLength: 'medium',
      needsVision: false,
      needsTools: false,
      needsCode: true,
      priorityOrder: defaultPriority,
    })

    expect(results.length).toBeGreaterThan(0)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].weightedScore).toBeGreaterThanOrEqual(results[i].weightedScore)
    }
  })

  it('excludes models that lack required capabilities (vision)', () => {
    const results = scoreModels({
      taskType: 'vision',
      complexity: 'simple',
      inputLength: 'short',
      needsVision: true,
      needsTools: false,
      needsCode: false,
      priorityOrder: defaultPriority,
    })

    // DeepSeek V4 has no vision — should be excluded
    const deepseek = results.find(m => m.slug === 'deepseek-v4')
    expect(deepseek).toBeUndefined()

    // Claude Sonnet 4.6 has vision — should be included
    const sonnet = results.find(m => m.slug === 'claude-sonnet-4.6')
    expect(sonnet).toBeDefined()
  })

  it('includes estimatedCost based on task input length', () => {
    const results = scoreModels({
      taskType: 'summarise',
      complexity: 'simple',
      inputLength: 'short',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      priorityOrder: defaultPriority,
    })

    for (const model of results) {
      expect(model.estimatedCost).toBeDefined()
      expect(model.estimatedCost).toBeGreaterThan(0)
    }
  })

  it('returns factorScores for each model with all 7 factors', () => {
    const results = scoreModels({
      taskType: 'generate',
      complexity: 'complex',
      inputLength: 'long',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      priorityOrder: defaultPriority,
    })

    const factors: Factor[] = ['cost', 'speed', 'quality', 'privacy', 'sustainability', 'transparency', 'capability']
    for (const model of results) {
      for (const factor of factors) {
        expect(model.factorScores[factor]).toBeDefined()
        expect(model.factorScores[factor]).toBeGreaterThanOrEqual(0)
        expect(model.factorScores[factor]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('ranks cost-sensitive priorities differently', () => {
    const costFirst: Factor[] = ['cost', 'speed', 'quality', 'capability', 'transparency', 'privacy', 'sustainability']
    const qualityFirst: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']

    const costResults = scoreModels({
      taskType: 'summarise',
      complexity: 'simple',
      inputLength: 'short',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      priorityOrder: costFirst,
    })

    const qualityResults = scoreModels({
      taskType: 'summarise',
      complexity: 'simple',
      inputLength: 'short',
      needsVision: false,
      needsTools: false,
      needsCode: false,
      priorityOrder: qualityFirst,
    })

    // Different priority orders should produce different #1 picks (or at least different scores)
    expect(costResults[0].weightedScore).not.toBeCloseTo(qualityResults[0].weightedScore, 3)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/scoring.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/lib/scoring.ts
import { getAllModels, type Factor, type Model } from './registry'
import { priorityToWeights } from './weights'

export interface ScoringInput {
  taskType: string
  complexity: string
  inputLength: string
  needsVision: boolean
  needsTools: boolean
  needsCode: boolean
  priorityOrder: Factor[]
}

export interface ScoredModel {
  slug: string
  name: string
  provider: string
  tier: string
  weightedScore: number
  factorScores: Record<Factor, number>
  estimatedCost: number
  capabilities: string[]
  strengths: string[]
  weaknesses: string[]
  contextWindow: number
}

const TOKEN_ESTIMATES: Record<string, { input: number; output: number }> = {
  short: { input: 500, output: 250 },
  medium: { input: 2000, output: 1000 },
  long: { input: 8000, output: 2000 },
  very_long: { input: 32000, output: 4000 },
}

function estimateCost(model: Model, inputLength: string): number {
  const tokens = TOKEN_ESTIMATES[inputLength] ?? TOKEN_ESTIMATES.medium
  const inputCost = (tokens.input / 1_000_000) * model.pricing.input_per_1m
  const outputCost = (tokens.output / 1_000_000) * model.pricing.output_per_1m
  return inputCost + outputCost
}

function costScore(model: Model, allModels: Model[], inputLength: string): number {
  const costs = allModels.map(m => estimateCost(m, inputLength))
  const minCost = Math.min(...costs)
  const maxCost = Math.max(...costs)
  if (maxCost === minCost) return 1.0
  const modelCost = estimateCost(model, inputLength)
  return 1.0 - (modelCost - minCost) / (maxCost - minCost)
}

function qualityScore(model: Model, taskType: string): number {
  return model.task_fitness[taskType] ?? 0.5
}

function capabilityScore(model: Model, needs: { vision: boolean; tools: boolean; code: boolean }): number | null {
  // Returns null if model fails hard requirement (should be excluded)
  if (needs.vision && !model.capabilities.includes('vision')) return null
  if (needs.tools && !model.capabilities.includes('tools')) return null
  if (needs.code && !model.capabilities.includes('code')) return null

  // Graduated score based on breadth of capabilities
  const allCaps = ['vision', 'tools', 'code', 'long_context', 'extended_thinking', 'structured_output', 'multilingual', 'audio', 'video']
  const modelCaps = model.capabilities.filter(c => allCaps.includes(c))
  return modelCaps.length / allCaps.length
}

export function scoreModels(input: ScoringInput): ScoredModel[] {
  const models = getAllModels()
  const weights = priorityToWeights(input.priorityOrder)

  const scored: ScoredModel[] = []

  for (const model of models) {
    // Check hard capability requirements
    const capScore = capabilityScore(model, {
      vision: input.needsVision,
      tools: input.needsTools,
      code: input.needsCode,
    })

    if (capScore === null) continue // excluded

    const factorScores: Record<Factor, number> = {
      cost: costScore(model, models, input.inputLength),
      speed: model.speed_score,
      quality: qualityScore(model, input.taskType),
      privacy: model.privacy_score,
      sustainability: model.sustainability.sustainability_score,
      transparency: model.transparency.transparency_score,
      capability: capScore,
    }

    const weightedScore = Object.entries(factorScores).reduce(
      (sum, [factor, score]) => sum + score * weights[factor as Factor],
      0
    )

    scored.push({
      slug: model.slug,
      name: model.name,
      provider: model.provider,
      tier: model.tier,
      weightedScore,
      factorScores,
      estimatedCost: estimateCost(model, input.inputLength),
      capabilities: model.capabilities,
      strengths: model.strengths,
      weaknesses: model.weaknesses,
      contextWindow: model.context_window,
    })
  }

  return scored.sort((a, b) => b.weightedScore - a.weightedScore)
}
```

**Step 4: Run tests**

Run: `npm test -- src/lib/__tests__/scoring.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/lib/scoring.ts src/lib/__tests__/scoring.test.ts
git commit -m "feat: add 7-factor scoring engine with tests"
```

---

## Task 5: Database Schema and Connection

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/db/migrations/001-initial-schema.sql`

**Step 1: Write the migration SQL**

```sql
-- src/db/migrations/001-initial-schema.sql

-- Users (Compare feature only — Sprint 3)
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  comparisons_today INT DEFAULT 0,
  last_comparison_date DATE
);

-- Core task submissions
CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  description_hash TEXT,
  task_type       TEXT,
  task_subtype    TEXT,
  complexity      TEXT,
  input_length    TEXT,
  needs_vision    BOOLEAN DEFAULT false,
  needs_tools     BOOLEAN DEFAULT false,
  needs_code      BOOLEAN DEFAULT false,
  is_recurring    BOOLEAN DEFAULT false,
  mode            TEXT DEFAULT 'recommend',
  priority_order  JSONB,
  classification_confidence FLOAT
);

-- Recommendations (full ranked list per task)
CREATE TABLE IF NOT EXISTS recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id),
  model_slug      TEXT NOT NULL,
  rank            INT NOT NULL,
  weighted_score  FLOAT NOT NULL,
  factor_scores   JSONB NOT NULL,
  reasoning       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Selections (what the user chose)
CREATE TABLE IF NOT EXISTS selections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id),
  model_slug      TEXT NOT NULL,
  recommended_rank INT,
  source          TEXT DEFAULT 'recommend',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Outcome feedback
CREATE TABLE IF NOT EXISTS outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id),
  selection_id    UUID REFERENCES selections(id),
  success         BOOLEAN,
  failure_reason  TEXT,
  feedback        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Head-to-head comparisons (Sprint 3)
CREATE TABLE IF NOT EXISTS comparisons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id),
  user_id         UUID REFERENCES users(id),
  model_a_slug    TEXT NOT NULL,
  model_b_slug    TEXT NOT NULL,
  prompt_hash     TEXT,
  preferred       TEXT,
  preference_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_recommendations_task ON recommendations(task_id);
CREATE INDEX IF NOT EXISTS idx_selections_task ON selections(task_id);
```

**Step 2: Write the database connection module**

```typescript
// src/lib/db.ts
import { neon } from '@neondatabase/serverless'

function getDb() {
  const databaseUrl = process.env.NEON_DATABASE_URL
  if (!databaseUrl) {
    throw new Error('NEON_DATABASE_URL is not set')
  }
  return neon(databaseUrl)
}

export async function createTask(params: {
  descriptionHash: string
  taskType: string
  taskSubtype: string | null
  complexity: string
  inputLength: string
  needsVision: boolean
  needsTools: boolean
  needsCode: boolean
  isRecurring: boolean
  mode: string
  priorityOrder: string[] | null
  classificationConfidence: number
}): Promise<string> {
  const sql = getDb()
  const result = await sql`
    INSERT INTO tasks (description_hash, task_type, task_subtype, complexity, input_length, needs_vision, needs_tools, needs_code, is_recurring, mode, priority_order, classification_confidence)
    VALUES (${params.descriptionHash}, ${params.taskType}, ${params.taskSubtype}, ${params.complexity}, ${params.inputLength}, ${params.needsVision}, ${params.needsTools}, ${params.needsCode}, ${params.isRecurring}, ${params.mode}, ${JSON.stringify(params.priorityOrder)}, ${params.classificationConfidence})
    RETURNING id
  `
  return result[0].id
}

export async function updateTaskPriorities(taskId: string, priorityOrder: string[]): Promise<void> {
  const sql = getDb()
  await sql`
    UPDATE tasks SET priority_order = ${JSON.stringify(priorityOrder)} WHERE id = ${taskId}
  `
}

export async function getTask(taskId: string) {
  const sql = getDb()
  const result = await sql`SELECT * FROM tasks WHERE id = ${taskId}`
  return result[0] ?? null
}

export async function saveRecommendations(taskId: string, models: {
  modelSlug: string
  rank: number
  weightedScore: number
  factorScores: Record<string, number>
  reasoning: string | null
}[]): Promise<void> {
  const sql = getDb()
  for (const model of models) {
    await sql`
      INSERT INTO recommendations (task_id, model_slug, rank, weighted_score, factor_scores, reasoning)
      VALUES (${taskId}, ${model.modelSlug}, ${model.rank}, ${model.weightedScore}, ${JSON.stringify(model.factorScores)}, ${model.reasoning})
    `
  }
}

export async function saveSelection(taskId: string, modelSlug: string, recommendedRank: number, source: string): Promise<string> {
  const sql = getDb()
  const result = await sql`
    INSERT INTO selections (task_id, model_slug, recommended_rank, source)
    VALUES (${taskId}, ${modelSlug}, ${recommendedRank}, ${source})
    RETURNING id
  `
  return result[0].id
}

export async function saveOutcome(taskId: string, selectionId: string, success: boolean, failureReason: string | null, feedback: string | null): Promise<void> {
  const sql = getDb()
  await sql`
    INSERT INTO outcomes (task_id, selection_id, success, failure_reason, feedback)
    VALUES (${taskId}, ${selectionId}, ${success}, ${failureReason}, ${feedback})
  `
}
```

**Step 3: Run the migration against Neon**

This requires the user to run the migration SQL against their Neon database. Provide instructions:

```
Open Neon dashboard → SQL Editor → paste contents of src/db/migrations/001-initial-schema.sql → Run
```

Or via psql:
```bash
psql $NEON_DATABASE_URL -f src/db/migrations/001-initial-schema.sql
```

**Step 4: Commit**

```bash
git add src/lib/db.ts src/db/migrations/001-initial-schema.sql
git commit -m "feat: add database schema and connection layer"
```

---

## Task 6: Classification Module

**Files:**
- Create: `src/lib/classification.ts`
- Create: `src/prompts/classify.md`
- Create: `src/lib/__tests__/classification.test.ts`

**Step 1: Write the classification prompt**

```markdown
<!-- src/prompts/classify.md -->
You are a task classifier for Bearing, an AI model recommendation tool. Given a user's description of what they want to use AI for, classify the task.

Return JSON only, no other text.

## Output schema

{
  "task_type": "summarise" | "generate" | "extract" | "code" | "analyse" | "translate" | "conversation" | "other",
  "task_subtype": string | null,
  "complexity": "simple" | "moderate" | "complex",
  "input_length": "short" | "medium" | "long" | "very_long",
  "needs_vision": boolean,
  "needs_tools": boolean,
  "needs_code": boolean,
  "is_recurring": boolean,
  "confidence": number (0.0-1.0),
  "clarification_needed": boolean,
  "suggested_questions": [
    {
      "question": string,
      "options": [string, string, ...]
    }
  ]
}

## Task type definitions

- **summarise**: Condensing longer text into shorter text. Meeting notes, article summaries, document digests.
- **generate**: Creating new text. Emails, proposals, reports, creative writing, marketing copy.
- **extract**: Pulling specific information from text. Data extraction, parsing, entity recognition.
- **code**: Writing, reviewing, debugging, or explaining code.
- **analyse**: Understanding, reasoning about, or evaluating information. Research, comparison, assessment.
- **translate**: Converting text between languages.
- **conversation**: Ongoing dialogue. Chatbots, tutoring, brainstorming, therapy-style conversations.
- **other**: Doesn't fit the above. Set clarification_needed to true.

## Rules

- If the description is too vague to classify (e.g. "help me with AI stuff"), set confidence to 0.0 and clarification_needed to true.
- If you can classify but aren't sure, set confidence between 0.3-0.6 and provide 1-3 suggested_questions as tappable options (not open-ended questions).
- If you're confident, set confidence above 0.6 and clarification_needed to false.
- Infer needs_vision, needs_tools, needs_code from the description context.
- Estimate input_length from the task description (a paragraph = short, a page = medium, a full document = long, multiple documents = very_long).
- is_recurring = true if the task sounds like something done regularly.

## Clarification questions

When clarification_needed is true, provide 1-3 questions. Each question must have 2-4 tappable options (short strings, not sentences). Examples:

- "Is this a one-off task or something you'll do regularly?" → ["One-off", "Weekly", "Daily"]
- "Roughly how long is the input?" → ["A paragraph", "A page", "A full document", "Multiple documents"]
- "Does this involve images or files, or is it text only?" → ["Text only", "Includes images", "Includes files"]
```

**Step 2: Write the failing test**

```typescript
// src/lib/__tests__/classification.test.ts
import { describe, it, expect } from 'vitest'
import { buildClassificationMessages, parseClassificationResponse, type Classification } from '../classification'

describe('classification', () => {
  it('builds messages from a task description', () => {
    const messages = buildClassificationMessages('I need to summarise meeting notes weekly')
    expect(messages).toHaveLength(2) // system + user
    expect(messages[0].role).toBe('user')
    expect(messages[1].role).toBe('user')
  })

  it('builds messages with clarification answers', () => {
    const messages = buildClassificationMessages(
      'I need to summarise meeting notes weekly',
      [{ question: 'How long are the notes?', answer: 'A page' }]
    )
    expect(messages).toHaveLength(2)
    // Second message should include the clarification context
    expect(messages[1].content).toContain('A page')
  })

  it('parses a valid classification response', () => {
    const raw = JSON.stringify({
      task_type: 'summarise',
      task_subtype: 'meeting_notes',
      complexity: 'simple',
      input_length: 'medium',
      needs_vision: false,
      needs_tools: false,
      needs_code: false,
      is_recurring: true,
      confidence: 0.9,
      clarification_needed: false,
      suggested_questions: [],
    })

    const result = parseClassificationResponse(raw)
    expect(result.task_type).toBe('summarise')
    expect(result.confidence).toBe(0.9)
    expect(result.clarification_needed).toBe(false)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseClassificationResponse('not json')).toThrow()
  })
})
```

**Step 3: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/classification.test.ts`
Expected: FAIL

**Step 4: Write implementation**

```typescript
// src/lib/classification.ts
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface Classification {
  task_type: string
  task_subtype: string | null
  complexity: string
  input_length: string
  needs_vision: boolean
  needs_tools: boolean
  needs_code: boolean
  is_recurring: boolean
  confidence: number
  clarification_needed: boolean
  suggested_questions: { question: string; options: string[] }[]
}

export interface ClarificationAnswer {
  question: string
  answer: string
}

const classifyPrompt = readFileSync(
  join(process.cwd(), 'src/prompts/classify.md'),
  'utf-8'
)

export function buildClassificationMessages(
  description: string,
  clarifications?: ClarificationAnswer[]
): { role: 'user'; content: string }[] {
  const messages: { role: 'user'; content: string }[] = [
    { role: 'user', content: classifyPrompt },
  ]

  let userContent = `Task description: "${description}"`
  if (clarifications?.length) {
    userContent += '\n\nClarification answers:\n'
    for (const c of clarifications) {
      userContent += `- ${c.question}: ${c.answer}\n`
    }
  }

  messages.push({ role: 'user', content: userContent })
  return messages
}

export function parseClassificationResponse(raw: string): Classification {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as Classification
}

export async function classifyTask(
  description: string,
  clarifications?: ClarificationAnswer[]
): Promise<Classification> {
  const client = new Anthropic()
  const messages = buildClassificationMessages(description, clarifications)

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: classifyPrompt,
    messages: [
      {
        role: 'user',
        content: messages[1].content,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return parseClassificationResponse(text)
}
```

**Step 5: Run tests**

Run: `npm test -- src/lib/__tests__/classification.test.ts`
Expected: All 4 tests PASS

**Step 6: Commit**

```bash
git add src/lib/classification.ts src/lib/__tests__/classification.test.ts src/prompts/classify.md
git commit -m "feat: add task classification module with Haiku integration"
```

---

## Task 7: Reasoning Module

**Files:**
- Create: `src/lib/reasoning.ts`
- Create: `src/prompts/reason.md`

**Step 1: Write the reasoning prompt**

```markdown
<!-- src/prompts/reason.md -->
You are writing short explanations for Bearing, an AI model recommendation tool. Given a task description and a list of scored models, write a one-sentence plain-English explanation for each model explaining why it ranked where it did.

Be specific to the user's task. Don't use generic phrases like "well-rounded" — say what makes this model good or bad for *their* task.

Return JSON only: an array of { "slug": string, "reasoning": string }

Keep each reasoning under 30 words.
```

**Step 2: Write implementation**

```typescript
// src/lib/reasoning.ts
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ScoredModel } from './scoring'

const reasonPrompt = readFileSync(
  join(process.cwd(), 'src/prompts/reason.md'),
  'utf-8'
)

export async function generateReasoning(
  taskDescription: string,
  taskType: string,
  models: ScoredModel[]
): Promise<Record<string, string>> {
  const client = new Anthropic()

  const modelSummaries = models.slice(0, 10).map((m, i) => ({
    rank: i + 1,
    slug: m.slug,
    name: m.name,
    provider: m.provider,
    weightedScore: m.weightedScore.toFixed(3),
    topFactors: Object.entries(m.factorScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([f, s]) => `${f}: ${s.toFixed(2)}`),
    estimatedCost: `$${m.estimatedCost.toFixed(4)}`,
  }))

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: reasonPrompt,
    messages: [
      {
        role: 'user',
        content: `Task: "${taskDescription}" (classified as: ${taskType})\n\nModels:\n${JSON.stringify(modelSummaries, null, 2)}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed: { slug: string; reasoning: string }[] = JSON.parse(cleaned)

  const map: Record<string, string> = {}
  for (const item of parsed) {
    map[item.slug] = item.reasoning
  }
  return map
}
```

**Step 3: Commit**

```bash
git add src/lib/reasoning.ts src/prompts/reason.md
git commit -m "feat: add reasoning generation module"
```

---

## Task 8: Server Actions

**Files:**
- Create: `src/app/actions.ts`

**Step 1: Write the server actions**

This is the glue layer — server actions called by UI components. Each action calls the appropriate lib function and writes to the database.

```typescript
// src/app/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { classifyTask, type ClarificationAnswer } from '@/lib/classification'
import { scoreModels, type ScoredModel } from '@/lib/scoring'
import { generateReasoning } from '@/lib/reasoning'
import { priorityToWeights } from '@/lib/weights'
import { createTask, updateTaskPriorities, getTask, saveRecommendations, saveSelection, saveOutcome } from '@/lib/db'
import { createHash } from 'crypto'
import type { Factor } from '@/lib/registry'

function hashDescription(description: string): string {
  return createHash('sha256').update(description.toLowerCase().trim()).digest('hex')
}

export async function submitTask(formData: FormData) {
  const description = formData.get('description') as string
  if (!description?.trim()) return { error: 'Please describe what you want to use AI for.' }

  const classification = await classifyTask(description)

  if (classification.confidence < 0.6 || classification.clarification_needed) {
    // Store description in a temporary way and return clarification questions
    // We create the task record but mark it as needing clarification
    const taskId = await createTask({
      descriptionHash: hashDescription(description),
      taskType: classification.task_type,
      taskSubtype: classification.task_subtype,
      complexity: classification.complexity,
      inputLength: classification.input_length,
      needsVision: classification.needs_vision,
      needsTools: classification.needs_tools,
      needsCode: classification.needs_code,
      isRecurring: classification.is_recurring,
      mode: 'recommend',
      priorityOrder: null,
      classificationConfidence: classification.confidence,
    })

    return {
      taskId,
      needsClarification: true,
      questions: classification.suggested_questions,
      description, // pass back for re-classification
    }
  }

  const taskId = await createTask({
    descriptionHash: hashDescription(description),
    taskType: classification.task_type,
    taskSubtype: classification.task_subtype,
    complexity: classification.complexity,
    inputLength: classification.input_length,
    needsVision: classification.needs_vision,
    needsTools: classification.needs_tools,
    needsCode: classification.needs_code,
    isRecurring: classification.is_recurring,
    mode: 'recommend',
    priorityOrder: null,
    classificationConfidence: classification.confidence,
  })

  redirect(`/recommend/${taskId}/priorities`)
}

export async function submitClarification(
  taskId: string,
  description: string,
  clarifications: ClarificationAnswer[]
) {
  const classification = await classifyTask(description, clarifications)

  // Update task with refined classification
  // For simplicity, we update via a new query
  const sql = (await import('@neondatabase/serverless')).neon(process.env.NEON_DATABASE_URL!)
  await sql`
    UPDATE tasks SET
      task_type = ${classification.task_type},
      task_subtype = ${classification.task_subtype},
      complexity = ${classification.complexity},
      input_length = ${classification.input_length},
      needs_vision = ${classification.needs_vision},
      needs_tools = ${classification.needs_tools},
      needs_code = ${classification.needs_code},
      is_recurring = ${classification.is_recurring},
      classification_confidence = ${classification.confidence}
    WHERE id = ${taskId}
  `

  if (classification.confidence < 0.6 && classification.clarification_needed) {
    return {
      taskId,
      needsClarification: true,
      questions: classification.suggested_questions,
      description,
    }
  }

  redirect(`/recommend/${taskId}/priorities`)
}

export async function submitPriorities(taskId: string, priorityOrder: Factor[]) {
  await updateTaskPriorities(taskId, priorityOrder)
  redirect(`/recommend/${taskId}/results`)
}

export async function getResults(taskId: string): Promise<{
  task: any
  models: ScoredModel[]
  reasoning: Record<string, string>
}> {
  const task = await getTask(taskId)
  if (!task) throw new Error('Task not found')

  const models = scoreModels({
    taskType: task.task_type,
    complexity: task.complexity,
    inputLength: task.input_length,
    needsVision: task.needs_vision,
    needsTools: task.needs_tools,
    needsCode: task.needs_code,
    priorityOrder: task.priority_order as Factor[],
  })

  // Save recommendations
  await saveRecommendations(
    taskId,
    models.map((m, i) => ({
      modelSlug: m.slug,
      rank: i + 1,
      weightedScore: m.weightedScore,
      factorScores: m.factorScores,
      reasoning: null, // filled async
    }))
  )

  // Generate reasoning (can be loaded async on the client)
  const reasoning = await generateReasoning(
    'User task', // We don't store raw description — use task type
    task.task_type,
    models
  )

  return { task, models, reasoning }
}

export async function selectModel(taskId: string, modelSlug: string, rank: number) {
  const selectionId = await saveSelection(taskId, modelSlug, rank, 'recommend')
  return { selectionId }
}

export async function submitOutcome(
  taskId: string,
  selectionId: string,
  success: boolean,
  failureReason: string | null,
  feedback: string | null
) {
  await saveOutcome(taskId, selectionId, success, failureReason, feedback)
}
```

**Step 2: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat: add server actions for recommend flow"
```

---

## Task 9: Home Page — Task Input

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Step 1: Build the home page**

The home page is a clean single-purpose page: a text area and a submit button. Two mode tabs (Recommend / Validate) above it.

Note: Visual design will be refined later using impeccable/frontend-design skills. This task builds the functional structure.

```typescript
// src/app/page.tsx
'use client'

import { useState } from 'react'
import { submitTask } from './actions'

export default function Home() {
  const [mode, setMode] = useState<'recommend' | 'validate'>('recommend')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await submitTask(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
    // redirect happens in server action if successful
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-2">Bearing</h1>
      <p className="text-lg text-gray-600 mb-8">Find the right AI model for your task</p>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('recommend')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            mode === 'recommend' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Recommend
        </button>
        <button
          onClick={() => setMode('validate')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            mode === 'validate' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Validate
        </button>
      </div>

      {mode === 'recommend' ? (
        <form action={handleSubmit} className="w-full max-w-xl">
          <textarea
            name="description"
            placeholder="What do you want to use AI for?"
            className="w-full h-32 p-4 border border-gray-300 rounded-lg text-lg resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
            required
          />
          {error && <p className="text-red-600 mt-2 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Classifying...' : 'Find my model'}
          </button>
        </form>
      ) : (
        <p className="text-gray-500">Validate mode coming in Sprint 2.</p>
      )}
    </main>
  )
}
```

Update `src/app/layout.tsx` with basic metadata:

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bearing — Find the right AI model',
  description: 'Describe what you want to do, set your priorities, get a ranked shortlist of AI models with transparent scoring.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

**Step 2: Verify it renders**

Run: `npm run dev`
Visit: http://localhost:3000
Expected: See "Bearing" heading, text area, mode tabs, submit button

**Step 3: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx src/app/globals.css
git commit -m "feat: add home page with task input"
```

---

## Task 10: Clarification Page

**Files:**
- Create: `src/app/recommend/[taskId]/page.tsx`

**Step 1: Build the clarification page**

This page shows when classification confidence is low. Displays 1–3 tappable questions, then re-submits.

```typescript
// src/app/recommend/[taskId]/page.tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { submitClarification } from '@/app/actions'
import type { ClarificationAnswer } from '@/lib/classification'

// Clarification questions are passed via searchParams or state
// In practice, we'll use a client-side state management approach

export default function ClarifyPage({ params }: { params: { taskId: string } }) {
  const [answers, setAnswers] = useState<ClarificationAnswer[]>([])
  const [questions, setQuestions] = useState<{ question: string; options: string[] }[]>([])
  const [loading, setLoading] = useState(false)
  const [round, setRound] = useState(1)

  // Questions will be passed from the home page via client state or URL
  // For now, this page handles the clarification loop

  async function handleAnswer(question: string, answer: string) {
    const newAnswers = [...answers, { question, answer }]
    setAnswers(newAnswers)

    // If we've answered all current questions, submit
    if (newAnswers.length === questions.length) {
      setLoading(true)
      const result = await submitClarification(
        params.taskId,
        '', // description passed from state
        newAnswers
      )
      if (result?.needsClarification && round < 2) {
        setQuestions(result.questions)
        setRound(round + 1)
        setAnswers([])
        setLoading(false)
      }
      // Otherwise redirect happens in server action
    }
  }

  if (questions.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p className="text-gray-500">Loading clarification questions...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-bold mb-2">A few quick questions</h2>
      <p className="text-gray-600 mb-8">Help us understand your task better</p>

      {questions.map((q, i) => (
        <div key={i} className="w-full max-w-md mb-6">
          <p className="font-medium mb-3">{q.question}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((option) => (
              <button
                key={option}
                onClick={() => handleAnswer(q.question, option)}
                disabled={loading || answers.some(a => a.question === q.question)}
                className={`px-4 py-2 rounded-lg border text-sm ${
                  answers.find(a => a.question === q.question)?.answer === option
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-300 hover:border-gray-900'
                } disabled:opacity-50`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}

      {loading && <p className="text-gray-500 mt-4">Refining classification...</p>}
    </main>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/recommend/[taskId]/page.tsx
git commit -m "feat: add clarification questions page"
```

---

## Task 11: Priority Ranking Page

**Files:**
- Create: `src/app/recommend/[taskId]/priorities/page.tsx`

**Step 1: Build the priority ranking page**

Drag-to-rank list of 7 factors. Uses native drag and drop for simplicity. Each factor has a short description.

```typescript
// src/app/recommend/[taskId]/priorities/page.tsx
'use client'

import { useState } from 'react'
import { submitPriorities } from '@/app/actions'
import type { Factor } from '@/lib/registry'

const FACTOR_INFO: { factor: Factor; label: string; description: string }[] = [
  { factor: 'quality', label: 'Quality', description: 'Best possible output for your task' },
  { factor: 'capability', label: 'Capability', description: 'Specific features like vision, code, long context' },
  { factor: 'cost', label: 'Cost', description: 'Keeping spend low' },
  { factor: 'transparency', label: 'Transparency', description: 'Open weights, training data, methodology' },
  { factor: 'privacy', label: 'Privacy', description: 'Data handling and retention policies' },
  { factor: 'sustainability', label: 'Sustainability', description: 'Energy use and environmental footprint' },
  { factor: 'speed', label: 'Speed', description: 'Fast responses' },
]

export default function PrioritiesPage({ params }: { params: { taskId: string } }) {
  const [items, setItems] = useState(FACTOR_INFO)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const newItems = [...items]
    const [dragged] = newItems.splice(dragIndex, 1)
    newItems.splice(index, 0, dragged)
    setItems(newItems)
    setDragIndex(index)
  }

  function handleDragEnd() {
    setDragIndex(null)
  }

  async function handleSubmit() {
    setLoading(true)
    const priorityOrder = items.map(i => i.factor)
    await submitPriorities(params.taskId, priorityOrder)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-bold mb-2">What matters most to you?</h2>
      <p className="text-gray-600 mb-8">Drag to reorder — most important at the top</p>

      <div className="w-full max-w-md space-y-2">
        {items.map((item, index) => (
          <div
            key={item.factor}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-3 p-4 bg-white border rounded-lg cursor-grab active:cursor-grabbing ${
              dragIndex === index ? 'opacity-50' : ''
            }`}
          >
            <span className="text-gray-400 text-sm font-mono w-6">{index + 1}</span>
            <div>
              <p className="font-medium">{item.label}</p>
              <p className="text-sm text-gray-500">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-8 px-8 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? 'Scoring models...' : 'Show me results'}
      </button>
    </main>
  )
}
```

**Step 2: Verify it renders**

Run: `npm run dev`
Visit: http://localhost:3000/recommend/test-id/priorities
Expected: Draggable priority list with submit button

**Step 3: Commit**

```bash
git add src/app/recommend/[taskId]/priorities/page.tsx
git commit -m "feat: add priority ranking page with drag-to-reorder"
```

---

## Task 12: Results Page

**Files:**
- Create: `src/app/recommend/[taskId]/results/page.tsx`

**Step 1: Build the results page**

The most important page. Shows ranked models with scores, reasoning, and factor breakdowns.

```typescript
// src/app/recommend/[taskId]/results/page.tsx
import { getResults, selectModel } from '@/app/actions'
import { ResultsClient } from './results-client'

export default async function ResultsPage({ params }: { params: { taskId: string } }) {
  const { task, models, reasoning } = await getResults(params.taskId)

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-2">Your results</h2>
        <p className="text-gray-600 mb-8">
          Ranked for <strong>{task.task_type}</strong> tasks based on your priorities
        </p>

        <ResultsClient
          taskId={params.taskId}
          models={models}
          reasoning={reasoning}
        />
      </div>
    </main>
  )
}
```

Create the client component for interactivity:

```typescript
// src/app/recommend/[taskId]/results/results-client.tsx
'use client'

import { useState } from 'react'
import { selectModel } from '@/app/actions'
import type { ScoredModel } from '@/lib/scoring'
import type { Factor } from '@/lib/registry'

const FACTOR_LABELS: Record<Factor, string> = {
  cost: 'Cost',
  speed: 'Speed',
  quality: 'Quality',
  privacy: 'Privacy',
  sustainability: 'Sustainability',
  transparency: 'Transparency',
  capability: 'Capability',
}

export function ResultsClient({
  taskId,
  models,
  reasoning,
}: {
  taskId: string
  models: ScoredModel[]
  reasoning: Record<string, string>
}) {
  const [selected, setSelected] = useState<string | null>(null)

  async function handleSelect(modelSlug: string, rank: number) {
    setSelected(modelSlug)
    await selectModel(taskId, modelSlug, rank)
  }

  return (
    <div className="space-y-4">
      {models.map((model, index) => (
        <div
          key={model.slug}
          className={`p-6 border rounded-lg ${
            index === 0 ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
          } ${selected === model.slug ? 'ring-2 ring-green-500' : ''}`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-gray-400">#{index + 1}</span>
                <h3 className="text-lg font-bold">{model.name}</h3>
              </div>
              <p className="text-sm text-gray-500">{model.provider}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{Math.round(model.weightedScore * 100)}%</div>
              <p className="text-xs text-gray-500">match</p>
            </div>
          </div>

          {reasoning[model.slug] && (
            <p className="text-sm text-gray-700 mb-3 italic">{reasoning[model.slug]}</p>
          )}

          {/* Factor score bars */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4">
            {(Object.entries(model.factorScores) as [Factor, number][]).map(([factor, score]) => (
              <div key={factor} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24">{FACTOR_LABELS[factor]}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full">
                  <div
                    className="h-2 bg-gray-900 rounded-full"
                    style={{ width: `${score * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              ~${model.estimatedCost.toFixed(4)} per task
            </span>
            <button
              onClick={() => handleSelect(model.slug, index + 1)}
              disabled={selected !== null}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                selected === model.slug
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              } disabled:opacity-50`}
            >
              {selected === model.slug ? 'Selected' : 'Use this one'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/recommend/[taskId]/results/
git commit -m "feat: add ranked results page with factor breakdowns"
```

---

## Task 13: Feedback Page

**Files:**
- Create: `src/app/recommend/[taskId]/feedback/page.tsx`

**Step 1: Build the outcome feedback page**

Simple thumbs up/down with failure reason options.

```typescript
// src/app/recommend/[taskId]/feedback/page.tsx
'use client'

import { useState } from 'react'
import { submitOutcome } from '@/app/actions'

const FAILURE_REASONS = [
  { value: 'too_slow', label: 'Too slow' },
  { value: 'poor_quality', label: 'Poor quality output' },
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'missing_capability', label: "Couldn't do what I needed" },
  { value: 'other', label: 'Other' },
]

export default function FeedbackPage({
  params,
  searchParams,
}: {
  params: { taskId: string }
  searchParams: { selectionId?: string }
}) {
  const [success, setSuccess] = useState<boolean | null>(null)
  const [failureReason, setFailureReason] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    if (success === null || !searchParams.selectionId) return
    await submitOutcome(
      params.taskId,
      searchParams.selectionId,
      success,
      failureReason,
      feedback || null
    )
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8">
        <h2 className="text-2xl font-bold mb-2">Thanks for the feedback</h2>
        <p className="text-gray-600">This helps improve recommendations for everyone.</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-bold mb-2">How did it go?</h2>
      <p className="text-gray-600 mb-8">Did the model work for your task?</p>

      <div className="flex gap-4 mb-8">
        <button
          onClick={() => { setSuccess(true); setFailureReason(null) }}
          className={`px-8 py-4 rounded-lg border text-lg ${
            success === true ? 'bg-green-50 border-green-500' : 'border-gray-300'
          }`}
        >
          Worked well
        </button>
        <button
          onClick={() => setSuccess(false)}
          className={`px-8 py-4 rounded-lg border text-lg ${
            success === false ? 'bg-red-50 border-red-500' : 'border-gray-300'
          }`}
        >
          Not great
        </button>
      </div>

      {success === false && (
        <div className="w-full max-w-md mb-6">
          <p className="font-medium mb-3">What went wrong?</p>
          <div className="flex flex-wrap gap-2">
            {FAILURE_REASONS.map(r => (
              <button
                key={r.value}
                onClick={() => setFailureReason(r.value)}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  failureReason === r.value ? 'bg-gray-900 text-white' : 'border-gray-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
        placeholder="Anything else? (optional)"
        className="w-full max-w-md h-24 p-3 border border-gray-300 rounded-lg resize-none mb-6"
      />

      <button
        onClick={handleSubmit}
        disabled={success === null}
        className="px-8 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        Submit feedback
      </button>
    </main>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/recommend/[taskId]/feedback/page.tsx
git commit -m "feat: add outcome feedback page"
```

---

## Task 14: Models Registry Page

**Files:**
- Create: `src/app/models/page.tsx`
- Create: `src/app/models/[slug]/page.tsx`

**Step 1: Build the browsable models page**

```typescript
// src/app/models/page.tsx
import { getAllModels } from '@/lib/registry'
import Link from 'next/link'

export default function ModelsPage() {
  const models = getAllModels()

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Model Registry</h1>
        <p className="text-gray-600 mb-8">{models.length} models across {new Set(models.map(m => m.provider)).size} providers</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {models.map(model => (
            <Link
              key={model.slug}
              href={`/models/${model.slug}`}
              className="p-4 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold">{model.name}</h3>
                  <p className="text-sm text-gray-500">{model.provider}</p>
                </div>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">{model.tier}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {model.capabilities.slice(0, 4).map(cap => (
                  <span key={cap} className="text-xs bg-gray-50 border px-2 py-0.5 rounded">
                    {cap}
                  </span>
                ))}
                {model.capabilities.length > 4 && (
                  <span className="text-xs text-gray-400">+{model.capabilities.length - 4}</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                ${model.pricing.input_per_1m}/M in · ${model.pricing.output_per_1m}/M out
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
```

```typescript
// src/app/models/[slug]/page.tsx
import { getModel, getAllModels } from '@/lib/registry'
import { notFound } from 'next/navigation'

export function generateStaticParams() {
  return getAllModels().map(m => ({ slug: m.slug }))
}

export default function ModelDetailPage({ params }: { params: { slug: string } }) {
  const model = getModel(params.slug)
  if (!model) notFound()

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-1">{model.name}</h1>
        <p className="text-gray-500 mb-6">{model.provider} · {model.tier}</p>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-2">Capabilities</h2>
          <div className="flex flex-wrap gap-2">
            {model.capabilities.map(cap => (
              <span key={cap} className="bg-gray-100 px-3 py-1 rounded-lg text-sm">{cap}</span>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-2">Strengths</h2>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            {model.strengths.map(s => <li key={s}>{s}</li>)}
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-2">Weaknesses</h2>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            {model.weaknesses.map(w => <li key={w}>{w}</li>)}
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-2">Pricing</h2>
          <p className="text-sm text-gray-700">
            ${model.pricing.input_per_1m}/M input tokens · ${model.pricing.output_per_1m}/M output tokens
          </p>
          <p className="text-sm text-gray-500">Context window: {model.context_window.toLocaleString()} tokens</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-2">Transparency</h2>
          <p className="text-sm text-gray-500 mb-2">{model.transparency.notes}</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Open weights: {model.transparency.open_weights}</div>
            <div>Open training data: {model.transparency.open_training_data}</div>
            <div>Open methodology: {model.transparency.open_methodology}</div>
            <div>Licence openness: {model.transparency.licence_openness}</div>
            <div>Provider disclosure: {model.transparency.provider_disclosure}</div>
            <div className="font-bold">Composite: {model.transparency.transparency_score}</div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-2">Sustainability</h2>
          <p className="text-sm text-gray-500 mb-2">{model.sustainability.notes}</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Inference energy: {model.sustainability.inference_energy ?? 'No data'}</div>
            <div>Training footprint: {model.sustainability.training_footprint ?? 'No data'}</div>
            <div>Provider infra: {model.sustainability.provider_infrastructure ?? 'No data'}</div>
            <div className="font-bold">Composite: {model.sustainability.sustainability_score}</div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-2">Task Fitness</h2>
          <div className="space-y-1">
            {Object.entries(model.task_fitness).map(([task, score]) => (
              <div key={task} className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-28">{task}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full">
                  <div className="h-2 bg-gray-900 rounded-full" style={{ width: `${(score as number) * 100}%` }} />
                </div>
                <span className="text-xs text-gray-400 w-8">{((score as number) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/models/
git commit -m "feat: add browsable model registry and detail pages"
```

---

## Task 15: About Page

**Files:**
- Create: `src/app/about/page.tsx`

**Step 1: Build the about page**

```typescript
// src/app/about/page.tsx
export default function AboutPage() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto prose">
        <h1>About Bearing</h1>

        <p>
          Bearing helps you choose the right AI model for your task. Describe what you want to do,
          tell us what matters to you, and get a ranked shortlist with transparent scoring.
        </p>

        <h2>How it works</h2>
        <ol>
          <li>Describe your task in plain English</li>
          <li>Answer a few quick clarifying questions</li>
          <li>Rank what matters to you (quality, cost, privacy, sustainability, transparency, speed, capability)</li>
          <li>Get a ranked list of models with transparent per-factor scores</li>
        </ol>

        <h2>How data is used</h2>
        <p>
          We collect anonymised data about what people want to use AI for and which models work.
          We <strong>never</strong> store your task description or prompts — only classified
          attributes (task type, complexity) and your model choice.
        </p>
        <p>
          This dataset is published openly. It helps anyone building routing, recommendation,
          or evaluation tools.
        </p>

        <h2>Open source</h2>
        <p>
          Bearing is open source. The scoring function, classification prompts, model registry,
          and all weights are visible in the repo.
        </p>

        <h2>Built by</h2>
        <p>The Good Ship · good-ship.co.uk</p>
      </div>
    </main>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/about/page.tsx
git commit -m "feat: add about page"
```

---

## Task 16: End-to-End Smoke Test

**Step 1: Run the migration**

Run the SQL in `src/db/migrations/001-initial-schema.sql` against Neon.

**Step 2: Set environment variables**

Confirm `.env.local` has valid values for `ANTHROPIC_API_KEY` and `NEON_DATABASE_URL`.

**Step 3: Start dev server and test the full flow**

Run: `npm run dev`

Test: 
1. Visit `/` — enter "I need to summarise long research papers weekly"
2. Should classify and redirect to `/recommend/[taskId]/priorities`
3. Reorder priorities, click "Show me results"
4. Should see ranked model list with scores and reasoning
5. Click "Use this one" on a model
6. Visit `/models` — should see all 17 models
7. Click a model — should see detail page

**Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Fix any issues found during smoke test**

Address anything broken.

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues from end-to-end smoke test"
```

---

## Task 17: Deploy to Vercel

**Step 1: Link to Vercel**

Run:
```bash
npx vercel link
```

**Step 2: Set environment variables in Vercel**

```bash
npx vercel env add ANTHROPIC_API_KEY
npx vercel env add NEON_DATABASE_URL
npx vercel env add OPENROUTER_API_KEY
```

**Step 3: Deploy**

Run:
```bash
npx vercel --prod
```

Expected: Successful deployment, live URL returned.

**Step 4: Smoke test on production**

Repeat the flow from Task 16 on the production URL.

**Step 5: Commit Vercel config if generated**

```bash
git add -A
git commit -m "feat: deploy to Vercel"
```

---

## Task 18: Update Project Files

**Step 1: Update CLAUDE.md**

Fill in the architecture, commands, and standards sections now that the project is scaffolded.

**Step 2: Update STATE.md**

Move the state diagram marker to "Building" and fill in component status.

**Step 3: Commit**

```bash
git add CLAUDE.md STATE.md
git commit -m "docs: update project tracking files after Sprint 1"
```

---

## Sprint 1 Complete

After Task 18, the core Recommend flow is live:
- User describes task → classification → priority ranking → ranked results → selection tracking
- 17 models scored across 7 factors
- Data collected in Neon for every interaction
- Deployed to Vercel

**Next sprints** (to be planned separately):
- Sprint 2: Validate mode, outcome feedback loop, `/models` polish, about/privacy
- Sprint 3: Compare mode (auth, OpenRouter, side-by-side, preferences)
- Sprint 4: Public dataset export, analysis, write-up
