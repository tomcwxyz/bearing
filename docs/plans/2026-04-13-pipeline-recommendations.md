# Pipeline Recommendations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect multi-stage tasks during classification and recommend a pipeline of models (one per stage + one alternative) as a supplementary section below the standard single-model results.

**Architecture:** Extend Haiku classification prompt to return `pipeline_recommended` and `pipeline_stages`. When true, the server action runs the scoring engine once per stage with capability filtering, then generates pipeline reasoning via Haiku. Results page shows a "Pipeline alternative" section below the main model list.

**Tech Stack:** Existing Claude Haiku (classification + reasoning), existing scoring engine, Neon Postgres (new JSONB column on tasks table).

---

### Task 1: Add pipeline_stages column to tasks table

**Files:**
- Create: `src/db/migrations/006-pipeline-stages.sql`

**Step 1: Write the migration**

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pipeline_stages JSONB;
```

**Step 2: Run the migration**

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
neon(process.env.NEON_DATABASE_URL)\`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pipeline_stages JSONB\`.then(() => console.log('Done'));
"
```

**Step 3: Commit**

```bash
git add src/db/migrations/006-pipeline-stages.sql
git commit -m "feat: add pipeline_stages column to tasks table"
```

---

### Task 2: Extend classification prompt and types

**Files:**
- Modify: `src/prompts/classify.md`
- Modify: `src/lib/classification.ts`
- Modify: `src/lib/__tests__/classification.test.ts`

**Step 1: Update the classify prompt**

Add to the output schema in `src/prompts/classify.md`:

```json
  "pipeline_recommended": boolean,
  "pipeline_stages": [
    {
      "stage": number,
      "task_type": "summarise" | "generate" | "extract" | "code" | "analyse" | "translate" | "conversation" | "vision" | "other",
      "description": string,
      "requires_capabilities": string[]
    }
  ] | null
```

Add a new section to the prompt:

```
## Pipeline detection

Some tasks involve multiple distinct processing steps that benefit from different models. When this is the case, set pipeline_recommended to true and provide pipeline_stages.

Examples of pipeline tasks:
- "Extract text from PDFs then summarise the key points" → stage 1: extract (needs vision), stage 2: summarise
- "Translate this document then generate a report from it" → stage 1: translate, stage 2: generate
- "OCR these invoices, pull out the amounts, and analyse spending trends" → stage 1: extract (needs vision), stage 2: extract, stage 3: analyse
- "Read this codebase and write documentation" → stage 1: code (analyse), stage 2: generate

Rules:
- Only recommend pipelines for tasks with 2+ clearly distinct operations
- Simple tasks (single question, single generation) should NOT get pipelines
- Each stage gets its own task_type from the standard set
- requires_capabilities should list capabilities needed for that stage (e.g. ["vision"] for PDF/image processing)
- If pipeline_recommended is false, set pipeline_stages to null
- Maximum 4 stages — if more would be needed, simplify
```

**Step 2: Update the Classification interface**

In `src/lib/classification.ts`, add to the `Classification` interface:

```typescript
  pipeline_recommended: boolean
  pipeline_stages: {
    stage: number
    task_type: string
    description: string
    requires_capabilities: string[]
  }[] | null
```

**Step 3: Write a test for pipeline classification parsing**

Add to `src/lib/__tests__/classification.test.ts`:

```typescript
describe('parseClassificationResponse - pipeline', () => {
  it('parses pipeline fields when present', () => {
    const raw = JSON.stringify({
      task_type: 'extract',
      task_subtype: 'document_processing',
      complexity: 'complex',
      input_length: 'long',
      needs_vision: true,
      needs_tools: false,
      needs_code: false,
      is_recurring: false,
      confidence: 0.9,
      clarification_needed: false,
      suggested_questions: [],
      pipeline_recommended: true,
      pipeline_stages: [
        { stage: 1, task_type: 'extract', description: 'Extract text from PDF', requires_capabilities: ['vision'] },
        { stage: 2, task_type: 'summarise', description: 'Summarise extracted content', requires_capabilities: [] },
      ],
    })
    const result = parseClassificationResponse(raw)
    expect(result.pipeline_recommended).toBe(true)
    expect(result.pipeline_stages).toHaveLength(2)
    expect(result.pipeline_stages![0].task_type).toBe('extract')
    expect(result.pipeline_stages![0].requires_capabilities).toEqual(['vision'])
  })

  it('handles non-pipeline classification', () => {
    const raw = JSON.stringify({
      task_type: 'summarise',
      task_subtype: null,
      complexity: 'simple',
      input_length: 'medium',
      needs_vision: false,
      needs_tools: false,
      needs_code: false,
      is_recurring: false,
      confidence: 0.95,
      clarification_needed: false,
      suggested_questions: [],
      pipeline_recommended: false,
      pipeline_stages: null,
    })
    const result = parseClassificationResponse(raw)
    expect(result.pipeline_recommended).toBe(false)
    expect(result.pipeline_stages).toBeNull()
  })
})
```

**Step 4: Run tests**

Run: `npm test -- src/lib/__tests__/classification.test.ts`
Expected: PASS

Run: `npm test`
Expected: All pass.

**Step 5: Commit**

```bash
git add src/prompts/classify.md src/lib/classification.ts src/lib/__tests__/classification.test.ts
git commit -m "feat: extend classification with pipeline detection"
```

---

### Task 3: Pipeline scoring function

**Files:**
- Create: `src/lib/pipeline.ts`
- Create: `src/lib/__tests__/pipeline.test.ts`

**Step 1: Write the test**

```typescript
// src/lib/__tests__/pipeline.test.ts
import { describe, it, expect } from 'vitest'
import { scorePipelineStage } from '../pipeline'
import type { Factor } from '../registry'

describe('scorePipelineStage', () => {
  const defaultPriorities: Factor[] = ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']

  it('returns top model and alternative for a stage', () => {
    const result = scorePipelineStage({
      taskType: 'extract',
      inputLength: 'long',
      requiresCapabilities: ['vision'],
      priorityOrder: defaultPriorities,
    })
    expect(result.recommended).toBeDefined()
    expect(result.recommended.slug).toBeTruthy()
    // All returned models should have vision capability
    expect(result.recommended.capabilities).toContain('vision')
    if (result.alternative) {
      expect(result.alternative.capabilities).toContain('vision')
    }
  })

  it('returns models without capability filter when empty', () => {
    const result = scorePipelineStage({
      taskType: 'summarise',
      inputLength: 'medium',
      requiresCapabilities: [],
      priorityOrder: defaultPriorities,
    })
    expect(result.recommended).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/pipeline.test.ts`
Expected: FAIL

**Step 3: Write pipeline.ts**

```typescript
// src/lib/pipeline.ts
import { getAllModels, type Factor, type Model } from './registry'
import { priorityToWeights } from './weights'
import { scoreModels, type ScoredModel } from './scoring'

export interface PipelineStageInput {
  taskType: string
  inputLength: string
  requiresCapabilities: string[]
  priorityOrder: Factor[]
}

export interface PipelineStageResult {
  recommended: ScoredModel
  alternative: ScoredModel | null
}

export interface PipelineResult {
  stages: Array<{
    stage: number
    description: string
    taskType: string
    recommended: ScoredModel
    alternative: ScoredModel | null
  }>
  totalEstimatedCost: number
}

export function scorePipelineStage(input: PipelineStageInput): PipelineStageResult {
  // Score all models for this stage's task type
  const scored = scoreModels({
    taskType: input.taskType,
    complexity: 'moderate',
    inputLength: input.inputLength,
    needsVision: input.requiresCapabilities.includes('vision'),
    needsTools: input.requiresCapabilities.includes('tools'),
    needsCode: input.requiresCapabilities.includes('code'),
    priorityOrder: input.priorityOrder,
  })

  // Further filter by any additional required capabilities
  const filtered = input.requiresCapabilities.length > 0
    ? scored.filter(m => input.requiresCapabilities.every(cap => m.capabilities.includes(cap)))
    : scored

  const models = filtered.length > 0 ? filtered : scored

  return {
    recommended: models[0],
    alternative: models.length > 1 ? models[1] : null,
  }
}

export function scorePipeline(
  stages: Array<{ stage: number; task_type: string; description: string; requires_capabilities: string[] }>,
  inputLength: string,
  priorityOrder: Factor[],
): PipelineResult {
  const results = stages.map(stage => {
    const stageResult = scorePipelineStage({
      taskType: stage.task_type,
      inputLength,
      requiresCapabilities: stage.requires_capabilities,
      priorityOrder,
    })
    return {
      stage: stage.stage,
      description: stage.description,
      taskType: stage.task_type,
      ...stageResult,
    }
  })

  const totalEstimatedCost = results.reduce(
    (sum, s) => sum + s.recommended.estimatedCost, 0
  )

  return { stages: results, totalEstimatedCost }
}
```

**Step 4: Run tests**

Run: `npm test -- src/lib/__tests__/pipeline.test.ts`
Expected: PASS

Run: `npm test`
Expected: All pass.

**Step 5: Commit**

```bash
git add src/lib/pipeline.ts src/lib/__tests__/pipeline.test.ts
git commit -m "feat: add pipeline scoring — per-stage model recommendations"
```

---

### Task 4: Pipeline reasoning prompt

**Files:**
- Create: `src/prompts/pipeline-reason.md`

**Step 1: Write the prompt**

A prompt for Haiku that generates a 1-2 sentence explanation of why a pipeline is better than a single model for this task. It receives the task description, pipeline stages with selected models, single-model cost vs pipeline cost.

The prompt should explain the benefit in plain language — e.g. "A pipeline saves ~60% here — Mistral OCR handles the PDF extraction cheaply, then Sonnet focuses on the analysis where quality matters most."

Follow the same pattern as `src/prompts/reason.md`.

**Step 2: Commit**

```bash
git add src/prompts/pipeline-reason.md
git commit -m "feat: add pipeline reasoning prompt"
```

---

### Task 5: Update getResults to include pipeline data

**Files:**
- Modify: `src/app/actions.ts`

**Step 1: Update getResults**

After the existing `scoreModels` call, check if the task has `pipeline_recommended`. If classification returned pipeline stages, also:

1. Call `scorePipeline` with the stages, input length, and priority order
2. Generate pipeline reasoning via Haiku using the pipeline-reason prompt
3. Store the pipeline result in the tasks table (`pipeline_stages` JSONB column)
4. Return the pipeline data alongside the existing models and reasoning

The return type changes from `{ task, models, reasoning }` to `{ task, models, reasoning, pipeline? }`.

But wait — the classification data is stored in the `tasks` table but `pipeline_recommended` and `pipeline_stages` from classification aren't stored yet. The classification happens in the `submitTask` action. So we need to:

1. In `submitTask` (action 1): store `pipeline_recommended` and the raw classification stages in the task row
2. In `getResults` (action 4): if the task has pipeline data, run `scorePipeline` and generate reasoning

For step 1, we need `pipeline_stages` to be saved during `submitTask`. The `createTask` function in db.ts needs to accept the pipeline classification data.

**Step 2: Update createTask in db.ts**

Add `pipelineStages` to `TaskParams`:
```typescript
export interface TaskParams {
  ...existing fields...
  pipelineRecommended?: boolean
  pipelineStages?: object[] | null
}
```

Update the `createTask` SQL to include `pipeline_stages`:
```typescript
// Add to the INSERT: pipeline_stages column
${params.pipelineStages ? JSON.stringify(params.pipelineStages) : null}
```

**Step 3: Update submitTask in actions.ts**

After classification, pass the pipeline data to `createTask`:
```typescript
pipelineRecommended: classification.pipeline_recommended,
pipelineStages: classification.pipeline_stages,
```

**Step 4: Update getResults in actions.ts**

After scoring single models, if `task.pipeline_stages` exists:
```typescript
import { scorePipeline, type PipelineResult } from '@/lib/pipeline'

// In getResults, after scoring models:
let pipeline: (PipelineResult & { reasoning: string }) | null = null
if (task.pipeline_stages) {
  const stages = typeof task.pipeline_stages === 'string'
    ? JSON.parse(task.pipeline_stages)
    : task.pipeline_stages
  const pipelineResult = scorePipeline(stages, task.input_length, priorityOrder)
  const pipelineReasoning = await generatePipelineReasoning(
    task.task_type,
    pipelineResult,
    models[0], // top single model for cost comparison
  )
  pipeline = { ...pipelineResult, reasoning: pipelineReasoning }
}

return { task, models, reasoning, pipeline }
```

**Step 5: Write generatePipelineReasoning helper**

Add a function in actions.ts that calls Haiku with the pipeline-reason prompt:
```typescript
async function generatePipelineReasoning(
  taskType: string,
  pipeline: PipelineResult,
  topSingleModel: ScoredModel,
): Promise<string> {
  const promptPath = join(process.cwd(), 'src', 'prompts', 'pipeline-reason.md')
  const systemPrompt = readFileSync(promptPath, 'utf-8')

  const stagesSummary = pipeline.stages.map(s =>
    `Stage ${s.stage}: ${s.description} → ${s.recommended.name} ($${s.recommended.estimatedCost.toFixed(4)})`
  ).join('\n')

  const userMessage = [
    `Task type: ${taskType}`,
    `Top single model: ${topSingleModel.name} ($${topSingleModel.estimatedCost.toFixed(4)})`,
    `Pipeline stages:\n${stagesSummary}`,
    `Pipeline total cost: $${pipeline.totalEstimatedCost.toFixed(4)}`,
  ].join('\n')

  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
```

Note: you'll need to add `import { readFileSync } from 'fs'` and `import { join } from 'path'` and `import Anthropic from '@anthropic-ai/sdk'` at the top of actions.ts if they're not already there.

**Step 6: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 7: Run tests**

Run: `npm test`
Expected: All pass.

**Step 8: Commit**

```bash
git add src/lib/db.ts src/app/actions.ts
git commit -m "feat: getResults returns pipeline recommendations when detected"
```

---

### Task 6: Pipeline UI component

**Files:**
- Create: `src/app/recommend/[taskId]/results/pipeline-section.tsx`

**Step 1: Build the component**

A client component that receives pipeline data and renders the "Pipeline alternative" section.

Props:
```typescript
interface PipelineSectionProps {
  pipeline: {
    stages: Array<{
      stage: number
      description: string
      taskType: string
      recommended: ScoredModel
      alternative: ScoredModel | null
    }>
    totalEstimatedCost: number
    reasoning: string
  }
  singleModelCost: number  // top single model cost for comparison
}
```

Layout:
- Section heading: "Pipeline alternative"
- Reasoning text in italic
- Stages shown as connected cards with arrow indicators between them
- Each stage card shows: stage number + description, recommended model (name, provider, cost), alternative in smaller text
- Footer: "Pipeline cost: $X.XXXX vs Single model: $Y.YYYY" with the savings percentage

Styling: white card with border-cream-dark. Stage cards inside with teal left border. Arrows between stages using a simple `→` character or CSS chevron. Teal accent color for stage numbers.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add src/app/recommend/[taskId]/results/pipeline-section.tsx
git commit -m "feat: add pipeline section UI component"
```

---

### Task 7: Wire pipeline into results page

**Files:**
- Modify: `src/app/recommend/[taskId]/results/results-client.tsx`
- Modify: `src/app/recommend/[taskId]/results/page.tsx`

**Step 1: Update ResultsClient props**

Add `pipeline` to `ResultsClientProps`:
```typescript
interface ResultsClientProps {
  taskId: string
  models: ScoredModel[]
  reasoning: Record<string, string>
  isAuthenticated?: boolean
  pipeline?: PipelineResult & { reasoning: string } | null
}
```

**Step 2: Render PipelineSection**

In `ResultsClient`, after the models list and before the "Compare two models" link, conditionally render:
```tsx
{pipeline && (
  <PipelineSection
    pipeline={pipeline}
    singleModelCost={models[0]?.estimatedCost ?? 0}
  />
)}
```

**Step 3: Update the server page**

In `src/app/recommend/[taskId]/results/page.tsx`, pass the pipeline data from `getResults` to `ResultsClient`.

**Step 4: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 5: Run tests**

Run: `npm test`
Expected: All pass.

**Step 6: Commit**

```bash
git add src/app/recommend/[taskId]/results/results-client.tsx src/app/recommend/[taskId]/results/page.tsx
git commit -m "feat: wire pipeline recommendations into results page"
```

---

### Task 8: Verify and smoke test

**Step 1: Run tests**

Run: `npm test`
Expected: All pass.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors.

**Step 3: Run build**

Run: `npm run build`
Expected: Clean build.

**Step 4: Smoke test**

- `npm run dev`
- Try a simple task ("summarise this email") → should NOT show pipeline section
- Try a multi-stage task ("extract text from PDFs and summarise the key findings") → should show pipeline section below results
- Try "OCR these invoices and analyse spending trends" → should show pipeline with vision model for stage 1
- Verify pipeline stages show recommended + alternative models
- Verify cost comparison in pipeline footer
- Verify all other features still work (Compare, Validate, admin)

**Step 5: Commit fixes**

```bash
git commit -m "fix: polish pipeline recommendations"
```

---

### Task 9: Update project files

**Files:**
- Modify: `PLAN.md`
- Modify: `STATE.md`

**Step 1: Update PLAN.md**

Add pipeline recommendation tasks to Sprint 4.

**Step 2: Update STATE.md**

Add pipeline recommendations to component table.

**Step 3: Commit**

```bash
git add PLAN.md STATE.md
git commit -m "docs: update project files for pipeline recommendations"
```

---

## Dependency Graph

```
Task 1 (migration) ──→ Task 5 (getResults update)
Task 2 (classification) ──→ Task 5
Task 3 (scoring) ──→ Task 5
Task 4 (reasoning prompt) ──→ Task 5
Task 5 ──→ Task 6 (pipeline UI)
Task 6 ──→ Task 7 (wire into results)
Task 7 ──→ Task 8 (verify)
Task 8 ──→ Task 9 (docs)
```

Tasks 1, 2, 3, 4 can all run in parallel.
