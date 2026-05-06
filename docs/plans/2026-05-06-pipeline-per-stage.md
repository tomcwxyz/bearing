# Pipeline per-stage classification & costing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make pipeline recommendations structurally correct by letting the classifier emit per-stage `input_length`, `output_length`, and `needs_reasoning`, threading those through scoring, and surfacing a warning when a stage's required capability cannot be met.

**Architecture:** Each pipeline stage already has its own `task_type` and `requires_capabilities`. We extend the classifier tool schema (and prompt) so each stage also carries its own input/output length and an optional reasoning flag. `scorePipelineStage` accepts those as overrides; `scorePipeline` plumbs them per stage. `actions.ts` falls back to the task-level value when a stage doesn't specify. Capability-missing is no longer a silent fallback — `scorePipelineStage` returns a `capabilityMissing` flag rendered in the UI.

**Tech Stack:** Next.js 15 server actions, TypeScript, Anthropic SDK tool-use, Vitest. JSONB column already stores arbitrary stage shapes — no DB migration needed.

**Out of scope:** Per-stage `data_sensitivity`, `latency_target`, `volume`, `is_agentic`, `needs_long_context`, `needs_multilingual`. These remain task-level. The most disruptive simplification (uniform-everything) is the three already addressed; the rest can follow if real pipelines justify it.

---

## Task 1: Extend `Classification.pipeline_stages` shape

**Files:**
- Modify: `src/lib/classification.ts:26-32` (`Classification` interface)
- Modify: `src/lib/classification.ts:113-125` (`CLASSIFY_TOOL.input_schema.pipeline_stages`)

**Step 1: Write the failing test**

Add to `src/lib/__tests__/classification.test.ts`:

```ts
it('accepts per-stage input_length, output_length, needs_reasoning in the schema', () => {
  // Type-level check: building a Classification with per-stage fields compiles.
  const c: Classification = {
    task_type: 'extract',
    task_subtype: null,
    complexity: 'moderate',
    input_length: 'long',
    needs_vision: true,
    needs_tools: false,
    needs_code: false,
    needs_reasoning: false,
    is_recurring: false,
    data_sensitivity: 'none',
    latency_target: 'interactive',
    volume: 'one_off',
    needs_long_context: false,
    needs_multilingual: false,
    is_agentic: false,
    output_length: 'medium',
    confidence: 0.9,
    clarification_needed: false,
    suggested_questions: [],
    pipeline_recommended: true,
    pipeline_stages: [
      {
        stage: 1,
        task_type: 'extract',
        description: 'OCR pages',
        requires_capabilities: ['vision'],
        input_length: 'long',
        output_length: 'long',
        needs_reasoning: false,
      },
      {
        stage: 2,
        task_type: 'summarise',
        description: 'Summarise extraction',
        requires_capabilities: [],
        input_length: 'long',
        output_length: 'short',
      },
    ],
  }
  expect(c.pipeline_stages?.[0].input_length).toBe('long')
  expect(c.pipeline_stages?.[1].output_length).toBe('short')
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/classification.test.ts -t "per-stage"`
Expected: FAIL — TS2322 on missing properties on `pipeline_stages` element type.

**Step 3: Update interface and tool schema**

`src/lib/classification.ts:26-32`:

```ts
pipeline_stages: {
  stage: number
  task_type: string
  description: string
  requires_capabilities: string[]
  input_length?: 'short' | 'medium' | 'long' | 'very_long'
  output_length?: 'short' | 'medium' | 'long' | 'very_long'
  needs_reasoning?: boolean
}[] | null
```

`src/lib/classification.ts:113-125` — extend `properties` of the stage object:

```ts
pipeline_stages: {
  type: ['array', 'null'],
  items: {
    type: 'object',
    properties: {
      stage: { type: 'number' },
      task_type: { type: 'string' },
      description: { type: 'string' },
      requires_capabilities: { type: 'array', items: { type: 'string' } },
      input_length: { type: 'string', enum: ['short', 'medium', 'long', 'very_long'] },
      output_length: { type: 'string', enum: ['short', 'medium', 'long', 'very_long'] },
      needs_reasoning: { type: 'boolean' },
    },
    required: ['stage', 'task_type', 'description', 'requires_capabilities'],
  },
},
```

The new fields are optional so old saved tasks still parse cleanly.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/classification.test.ts`
Expected: all pass, including the new case.

**Step 5: Commit**

```bash
git add src/lib/classification.ts src/lib/__tests__/classification.test.ts
git commit -m "feat(classification): per-stage input/output length + needs_reasoning"
```

---

## Task 2: Per-stage overrides in `scorePipelineStage`

**Files:**
- Modify: `src/lib/pipeline.ts:4-65` (input type and scoring call)
- Test: `src/lib/__tests__/pipeline.test.ts`

**Step 1: Write the failing test**

Add to `src/lib/__tests__/pipeline.test.ts`:

```ts
it('honours per-stage outputLength override when costing the stage', () => {
  const longOut = scorePipelineStage({
    taskType: 'extract',
    inputLength: 'long',
    outputLength: 'very_long',
    requiresCapabilities: [],
    priorityOrder: defaultPriorities,
  })
  const shortOut = scorePipelineStage({
    taskType: 'extract',
    inputLength: 'long',
    outputLength: 'short',
    requiresCapabilities: [],
    priorityOrder: defaultPriorities,
  })
  // Same model can win both; what we check is that costing reflects the
  // per-stage outputLength rather than ignoring it.
  expect(longOut.recommended.estimatedCost).toBeGreaterThan(
    shortOut.recommended.estimatedCost
  )
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pipeline.test.ts -t "outputLength"`
Expected: FAIL — `outputLength` is not in `PipelineStageInput`.

**Step 3: Add `outputLength` to `PipelineStageInput`**

`src/lib/pipeline.ts:4-17` — add `outputLength?: string` to the existing interface (it's already used by `scoreModels` but not exposed as a stage input — verify line 16 already has it; if so, re-state the existing field and ensure it is forwarded to `scoreModels` on line 51). No structural change if already present; otherwise add it and pass it through.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/pipeline.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/pipeline.ts src/lib/__tests__/pipeline.test.ts
git commit -m "test(pipeline): verify per-stage outputLength is honoured in costing"
```

---

## Task 3: Per-stage values in `scorePipeline`

**Files:**
- Modify: `src/lib/pipeline.ts:71-115`
- Test: `src/lib/__tests__/pipeline.test.ts`

**Step 1: Write the failing test**

```ts
it('uses per-stage input_length, output_length, needs_reasoning overrides', () => {
  const result = scorePipeline({
    stages: [
      {
        stage: 1,
        task_type: 'extract',
        description: 'OCR',
        requires_capabilities: ['vision'],
        input_length: 'long',
        output_length: 'long',
        needs_reasoning: false,
      },
      {
        stage: 2,
        task_type: 'summarise',
        description: 'Summarise',
        requires_capabilities: [],
        input_length: 'long',
        output_length: 'short',
        needs_reasoning: false,
      },
    ],
    inputLength: 'short',     // task-level fallback, should be overridden
    outputLength: 'very_long', // task-level fallback, should be overridden
    priorityOrder: defaultPriorities,
  })
  // Stage 2 outputs short, so its cost must be < stage 1 (long output).
  expect(result.stages[1].recommended.estimatedCost)
    .toBeLessThan(result.stages[0].recommended.estimatedCost)
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pipeline.test.ts -t "per-stage"`
Expected: FAIL — `input_length` / `output_length` not accepted on stages.

**Step 3: Update `ScorePipelineOptions.stages` and the mapping**

`src/lib/pipeline.ts:72`:

```ts
stages: Array<{
  stage: number
  task_type: string
  description: string
  requires_capabilities: string[]
  input_length?: string
  output_length?: string
  needs_reasoning?: boolean
}>
```

`src/lib/pipeline.ts:87-101` — apply per-stage overrides with task-level fallback:

```ts
const results = stages.map(stage => {
  const stageResult = scorePipelineStage({
    taskType: stage.task_type,
    inputLength: stage.input_length ?? inputLength,
    outputLength: stage.output_length ?? options.outputLength,
    requiresCapabilities: stage.requires_capabilities,
    priorityOrder,
    needsReasoning: stage.needs_reasoning ?? options.needsReasoning ?? false,
    dataSensitivity: options.dataSensitivity,
    latencyTarget: options.latencyTarget,
    volume: options.volume,
    needsLongContext: options.needsLongContext,
    needsMultilingual: options.needsMultilingual,
    isAgentic: options.isAgentic,
  })
  ...
})
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/pipeline.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/pipeline.ts src/lib/__tests__/pipeline.test.ts
git commit -m "feat(pipeline): per-stage input/output length + needs_reasoning"
```

---

## Task 4: Surface capability-missing instead of silent fallback

**Files:**
- Modify: `src/lib/pipeline.ts:19-65`
- Test: `src/lib/__tests__/pipeline.test.ts`

**Step 1: Write the failing test**

```ts
it('flags capabilityMissing when no scored model satisfies requires_capabilities', () => {
  const result = scorePipelineStage({
    taskType: 'extract',
    inputLength: 'short',
    requiresCapabilities: ['nonexistent_capability'],
    priorityOrder: defaultPriorities,
  })
  expect(result.capabilityMissing).toBe(true)
  expect(result.recommended).toBeDefined() // still returns best effort
})

it('does not flag capabilityMissing when capability is satisfiable', () => {
  const result = scorePipelineStage({
    taskType: 'extract',
    inputLength: 'short',
    requiresCapabilities: ['vision'],
    priorityOrder: defaultPriorities,
  })
  expect(result.capabilityMissing).toBeFalsy()
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pipeline.test.ts -t "capabilityMissing"`
Expected: FAIL — property does not exist.

**Step 3: Add `capabilityMissing` to result and set it**

`src/lib/pipeline.ts:19-22`:

```ts
export interface PipelineStageResult {
  recommended: ScoredModel
  alternative: ScoredModel | null
  capabilityMissing?: boolean
}
```

`src/lib/pipeline.ts:54-65` — track when fallback was used:

```ts
const filtered = input.requiresCapabilities.length > 0
  ? scored.filter(m => input.requiresCapabilities.every(cap => m.capabilities.includes(cap)))
  : scored
const capabilityMissing = input.requiresCapabilities.length > 0 && filtered.length === 0
const models = filtered.length > 0 ? filtered : scored
return {
  recommended: models[0],
  alternative: models.length > 1 ? models[1] : null,
  capabilityMissing,
}
```

Also extend the per-stage result in `scorePipeline` (line 102-107) so it propagates:

```ts
return {
  stage: stage.stage,
  description: stage.description,
  taskType: stage.task_type,
  recommended: stageResult.recommended,
  alternative: stageResult.alternative,
  capabilityMissing: stageResult.capabilityMissing,
}
```

Update `PipelineResult.stages[]` type accordingly (line 25-31).

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/pipeline.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/pipeline.ts src/lib/__tests__/pipeline.test.ts
git commit -m "feat(pipeline): surface capability-missing instead of silent fallback"
```

---

## Task 5: Pass per-stage values through `actions.ts`

**Files:**
- Modify: `src/app/actions.ts:220-244`

**Step 1: Read current call site**

Confirm shape of `task.pipeline_stages` (already JSONB). The new optional fields land in the JSON automatically because the classifier writes the raw tool input.

**Step 2: Verify nothing needs to change**

`scorePipeline` already iterates `stages` and now reads `stage.input_length`, `stage.output_length`, `stage.needs_reasoning` per Task 3. The task-level values (`task.input_length`, `task.output_length`, `task.needs_reasoning`) remain the fallbacks. No code change needed in `actions.ts`.

**Step 3: Add an integration assertion**

Add to `src/lib/__tests__/pipeline.test.ts`:

```ts
it('falls back to task-level input/output length when stage omits them', () => {
  const result = scorePipeline({
    stages: [
      { stage: 1, task_type: 'extract', description: 'x', requires_capabilities: [] },
    ],
    inputLength: 'long',
    outputLength: 'very_long',
    priorityOrder: defaultPriorities,
  })
  expect(result.stages[0].recommended.estimatedCost).toBeGreaterThan(0)
})
```

**Step 4: Run all pipeline tests**

Run: `npx vitest run src/lib/__tests__/pipeline.test.ts`
Expected: all pass.

**Step 5: Commit**

```bash
git add src/lib/__tests__/pipeline.test.ts
git commit -m "test(pipeline): task-level fallback when stage omits length"
```

---

## Task 6: Render capability warning in `PipelineSection`

**Files:**
- Modify: `src/app/recommend/[taskId]/results/pipeline-section.tsx:5-11` (stage type)
- Modify: `src/app/recommend/[taskId]/results/pipeline-section.tsx:38-72` (render)

**Step 1: Extend the stage prop type**

```ts
interface PipelineStage {
  stage: number
  description: string
  taskType: string
  recommended: ScoredModel
  alternative: ScoredModel | null
  capabilityMissing?: boolean
}
```

**Step 2: Render the warning inside each stage card**

Below the existing alternative line:

```tsx
{stage.capabilityMissing && (
  <p className="mt-1 text-amber-700 text-xs">
    No model in the registry advertises every required capability for this
    stage. The recommendation above is a best-effort fallback — verify it
    handles {stage.taskType} inputs as needed.
  </p>
)}
```

**Step 3: Manually verify**

Run: `npm run dev` then submit a task where the classifier produces a `requires_capabilities: ["vision"]` stage; confirm no warning fires for normal cases. To force the warning, temporarily edit a saved task in DB to include a fake capability and reload `/recommend/<id>/results`.

**Step 4: Commit**

```bash
git add src/app/recommend/[taskId]/results/pipeline-section.tsx
git commit -m "feat(pipeline-ui): warn when a stage's capability cannot be met"
```

---

## Task 7: Update the classifier prompt

**Files:**
- Modify: `src/prompts/classify.md` (the JSON shape block ~line 32-41 and Rules block ~line 154-158)

**Step 1: Update the JSON shape description**

Change the `pipeline_stages` block to:

```
"pipeline_stages": [
  {
    "stage": number,
    "task_type": "summarise" | "generate" | "extract" | "code" | "analyse" | "translate" | "conversation" | "vision" | "other",
    "description": string,
    "requires_capabilities": string[],
    "input_length": "short" | "medium" | "long" | "very_long",
    "output_length": "short" | "medium" | "long" | "very_long",
    "needs_reasoning": boolean
  }
] | null
```

**Step 2: Add per-stage guidance under the existing Rules section**

```
- Each stage's input_length is the size of what enters THAT stage, not the
  whole task. Stage 2's input is whatever stage 1 produced.
- Each stage's output_length is the size of what THAT stage emits. Earlier
  stages often emit "long" intermediate artefacts; the final stage's output
  is what the user actually sees.
- needs_reasoning is per stage. Most pipelines have at most one reasoning
  stage; mechanical stages (OCR, translation, formatting) should be false.
```

**Step 3: Manual sanity check**

Run: `npx tsx scripts/test-recommendations.ts` (existing baseline harness) and confirm pipeline cases still parse without error. No automated assert — this is prompt copy.

**Step 4: Commit**

```bash
git add src/prompts/classify.md
git commit -m "docs(classify): instruct per-stage length and reasoning"
```

---

## Task 8: Verification pass

**Step 1: Full test suite**

Run: `npx vitest run`
Expected: all pass (existing 71 + new cases).

**Step 2: Type check + lint**

Run: `npm run build` (Next.js compiles + TS-checks pages, server actions, components).
Expected: clean build.

**Step 3: End-to-end smoke**

In `npm run dev`, submit a multi-stage prompt: *"Extract text from these scanned invoices then summarise the totals into a one-page memo."* Confirm:
- Classifier returns ≥2 stages with distinct `output_length` (long → short).
- Pipeline section shows different per-stage cost values.
- "Pipeline vs Single model" comparison no longer trivially equals `n × single_cost`.

**Step 4: Commit any final tweaks**

```bash
git add -A
git commit -m "chore: pipeline per-stage classification verified"
```

---

## Notes

- DB: no migration needed. `pipeline_stages JSONB` already accepts arbitrary stage shapes; old rows lacking the new fields fall back to task-level values via `??` in `scorePipeline`.
- `generatePipelineReasoning` (`src/app/actions.ts:442`) summarises stages from `PipelineResult` — it doesn't read the new fields, so no change required, though we could mention per-stage cost in the prompt later if it adds value.
- Re-grounding script (`scripts/reground-tasks.ts` per recent commit) is unrelated to pipeline shape.
