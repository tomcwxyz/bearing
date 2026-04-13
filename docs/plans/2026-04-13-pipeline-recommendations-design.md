# Pipeline Recommendations Design

> Date: 2026-04-13
> Status: Approved

## Goal

When a user's task involves multiple distinct processing steps, recommend a pipeline of models (one per stage) as an alternative to a single model. Show the pipeline below the standard results with cost comparison.

## Approach

Extend Haiku classification to detect multi-stage tasks and return pipeline stages. Score each stage independently using the existing scoring engine with capability filtering. Show the pipeline as a supplementary section below the single-model results.

## Classification changes

Extend `src/prompts/classify.md` output with two new fields:

- `pipeline_recommended: boolean` — true when the task involves 2+ distinct processing steps that benefit from different models
- `pipeline_stages: [{ stage, task_type, description, requires_capabilities }]` — ordered array, only present when pipeline_recommended is true

Guidelines for Haiku:
- Pipeline when task has distinct operations (extract→analyse, OCR→summarise, translate→generate)
- Each stage maps to an existing task_type
- `requires_capabilities` filters eligible models (e.g. vision for PDF stage)
- Simple single-step tasks remain `pipeline_recommended: false`

## Pipeline scoring

When `pipeline_recommended` is true, the server action:

1. For each stage: filter models by `requires_capabilities`, run `scoreModels` with the stage's `task_type` and user's priority order
2. Take top model as recommendation, #2 as alternative
3. Sum per-stage estimated costs for total pipeline cost
4. Call Haiku to generate 1-2 sentence reasoning explaining why a pipeline helps

Result shape:
```typescript
interface PipelineResult {
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
```

No changes to the scoring engine — it's called once per stage.

## Results UI

Below the existing ranked model list, when `pipeline_recommended` is true:

- "Pipeline alternative" section with Haiku's reasoning
- Visual stage flow with arrows: Stage 1 → Stage 2 → Stage 3
- Each stage: number, description, recommended model card (name, provider, cost), alternative in smaller text
- Footer: total pipeline cost vs single-model cost comparison

Styling matches existing results cards.

## Data storage

Add one column to tasks table:
```sql
ALTER TABLE tasks ADD COLUMN pipeline_stages JSONB;
```

Stores the full pipeline result when recommended, null otherwise. Existing `recommendations` table continues to store single-model results. Pipeline is supplementary.

## What's not included

- Pipeline execution (advisory only — Bearing recommends, doesn't run)
- Pipeline templates / recipes (future — patterns emerge from data)
- User-defined custom stages
- More than one recommended + one alternative per stage
