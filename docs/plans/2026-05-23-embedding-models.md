# Embedding models as a first-class concept

**Date:** 2026-05-23
**Status:** Drafting — awaiting plan approval before code
**Owner:** Tom
**Target version:** v0.9.0 (breaking schema change)

## Motivation

A user ran a summarisation task whose pipeline returned `gemini-3-flash`
for all three stages, including a stage the classifier described as
"embedding". The reason: Bearing's registry contains zero embedding
models, and `embedding` is not a recognised task type. The classifier
falls back to `extract` or `analyse` for vector-producing stages, and
gemini-3-flash happens to top those task types. The user sees the same
chat model recommended for indexing — which is a real product gap, not
a scoring bug.

Embedding is a distinct workload. Embedding models (text-embedding-3,
voyage-3, BGE-M3, Nomic-embed) differ from chat LLMs in:

- **Output:** fixed-dimensional vectors, not tokens.
- **Pricing:** input-only — no output token cost. Often 5–20× cheaper
  per 1M tokens than the cheapest chat model.
- **Latency:** typically sub-100 ms for short inputs, much faster than
  chat generation.
- **Sizing:** the relevant axes are embedding dimension, max input
  length, and (for retrieval) MTEB benchmark performance — not the
  chat-style "quality / cost / speed" trade-off.
- **Local options:** open embedding models (BGE-M3, Nomic-embed-v2,
  GTE-Qwen2-7B) are small enough that almost everyone can run them
  locally, which changes the calculus on privacy / sustainability.

Recommending a chat model for an embedding stage is wrong twice over:
the user pays generative-model prices for a vector job, and the chat
model is not optimised for the retrieval task.

## Approved decisions (from `/clarify` 2026-05-23)

1. **Scope:** full embedding tier — registry models (cloud + local),
   MTEB benchmark ingest, classifier extension, pipeline routing, and
   a dedicated "find an embedding model" entry point.
2. **Type system:** add `embedding` as the 13th canonical `TaskType`,
   AND surface a separate "Find an embedding model" mode on the home
   page for users who explicitly want vector models.
3. **Version bump:** `v0.9.0`. Adds `classification_schema_version =
   'v0.9'` to new tasks. Does not invalidate v0.8 (the type set is a
   superset).

## Out of scope for this branch

- Multimodal embeddings (image / audio embeddings — CLIP, ImageBind).
  Add later under `capabilities: ["vision"]` on embedding models.
- Re-ranker models (Cohere Rerank, BGE-reranker). Distinct workload;
  separate plan if ever needed.
- Fine-tuned embedding endpoints (Cohere Custom, OpenAI fine-tune).
  Out of scope until base-model coverage is solid.

## Architecture

### Schema

#### Migration 021 — `model_class` + embedding fields on `models`

```sql
ALTER TABLE models
  ADD COLUMN IF NOT EXISTS model_class TEXT NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS embedding_dim INTEGER,
  ADD COLUMN IF NOT EXISTS max_input_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS supports_matryoshka BOOLEAN DEFAULT FALSE;

-- Existing 31 rows get model_class='chat' by default. Embedding fields
-- stay NULL on chat models.
CREATE INDEX IF NOT EXISTS models_class_idx ON models(model_class)
  WHERE active = true;
```

#### Migration 022 — `classification_schema_version` default bump

The default for new task rows is changed from `'v0.7'` to `'v0.9'` (or
`createTask` writes `'v0.9'` directly, matching how it currently writes
`'v0.8'`). Existing rows keep their stamped value.

### Type system

`src/lib/registry.ts`:

```ts
export const ALL_TASK_TYPES = [
  // chat / generative (unchanged from v0.8)
  'summarise', 'extract', 'generate', 'comms', 'code', 'math',
  'reasoning', 'analyse', 'research', 'qa', 'translate', 'conversation',
  // new
  'embedding',
] as const

export const TASK_TYPE_LABELS = {
  // ...
  embedding: 'embedding (vector search / RAG)',
}

export type ModelClass = 'chat' | 'embedding'

export interface Model {
  // existing fields...
  model_class: ModelClass  // new — defaults to 'chat'
  embedding_dim?: number
  max_input_tokens?: number
  supports_matryoshka?: boolean
}
```

#### Pricing shape

Embedding pricing currently has no output token cost. Two options:

- **A.** Reuse `ModelPricing` and set `output_per_1m: 0` for embedding
  models. Existing cost code Just Works. Documented invariant: when
  `model_class='embedding'`, `output_per_1m` is always 0.
- **B.** New optional `pricing_unit` field on the existing shape.

**Recommend A.** Less code change, less risk. Cost estimator already
multiplies by output token count (which we set to 0 for embedding
tasks). The "documented invariant" is easy to enforce in `seed-models`
and in the admin import flow.

### Scoring

`src/lib/scoring.ts` needs to filter by `model_class` based on task
type. Specifically:

- If `taskType === 'embedding'`, include only models with
  `model_class === 'embedding'`.
- If `taskType !== 'embedding'`, include only models with
  `model_class === 'chat'`.

This is a hard filter (like the existing `needs_long_context`
threshold). It happens before factor scoring.

Cost factor for embedding tasks: input cost only. Set
`OUTPUT_TOKEN_ESTIMATES['embedding'] = 0` and the existing code path
produces correct numbers.

`task_fitness` for embedding models: only the `embedding` key matters.
Other keys (`code`, `analyse`, etc.) stay at 0 — they will never be
queried because the hard filter routes embedding queries to embedding
models and vice versa.

`task_fitness` for chat models: the `embedding` key is added, defaults
to 0. This is consistent with how chat models can't satisfy an
embedding task.

### Benchmarks: MTEB ingest

New file `scripts/ingest-mteb.ts`. Mirrors `ingest-lmarena.ts` but
pulls from the MTEB leaderboard. Source options:

- **mteb/leaderboard** HF Space — has structured JSON but is updated
  via space rebuilds; staleness varies.
- **mteb/results** HF dataset — raw per-model task scores. More
  authoritative; preferred.

Categories we care about for v0.9:

- `mteb.retrieval` — primary signal for embedding quality. Average
  nDCG@10 across BEIR-style retrieval tasks.
- `mteb.sts` — semantic similarity. Useful as a secondary axis.
- `mteb.classification` — embeddings used for downstream classification.
- `mteb.clustering` — embeddings used for clustering / dedup.

`src/lib/benchmarks.ts` `CATEGORY_TO_TASKS` extension:

```ts
'mteb.retrieval': ['embedding'],
'mteb.sts': ['embedding'],
'mteb.classification': ['embedding'],
'mteb.clustering': ['embedding'],
```

These all map to the same `embedding` key. Unlike chat models where
different benchmark categories feed different task types, embedding
quality is one-dimensional for our purposes (a model that wins at MTEB
retrieval almost always wins at the other axes too — high inter-task
correlation).

License: MTEB results are released under MIT. Cite as Muennighoff et
al. 2023 in `scoring_methodology.benchmarks`.

### Pipeline routing

`src/lib/pipeline.ts` already calls `scoreModels` per stage. With the
hard filter in scoring, an embedding stage will pick from embedding
models only — no other change needed.

One subtlety: pipeline stages currently inherit `priorityOrder` from
the parent task. If the parent task prioritised quality+speed
(typical for chat), those same priorities apply to the embedding stage,
which is usually fine (embedding selection within MTEB-graded models
should still respect cost / quality / speed weights).

### UI

#### Find-an-embedding-model entry point

New route: `/embedding`. Lives alongside `/recommend`, `/pipeline`,
`/validate`, `/compare`. Form fields:

- **What's it for?** retrieval / RAG | semantic similarity |
  classification | clustering | dedup | other
- **Input size:** short (queries) | medium (paragraphs) | long
  (full docs)
- **Hosting:** prefer hosted | prefer open / self-hosted | no
  preference
- **Languages:** English only | English + a few others |
  many languages
- **Latency:** doesn't matter | interactive | realtime

This populates a synthetic task with `task_type='embedding'` and runs
through the same scoring pipeline. Output looks like the existing
`/recommend` results — ranked cards with factor bars — but adapted:

- Embedding dim shown prominently
- Max input length shown
- "Cost per 1M tokens" instead of "cost per task"
- No "selected model → outcome" funnel (embedding is rarely a
  one-shot decision; users pick and integrate)

#### Pipeline UI

When a stage has `task_type='embedding'`, the stage card shows the
embedding-specific surface (dim, max input, "cost per 1M tokens").
Existing stage layout otherwise unchanged.

#### Model detail page

For `model_class='embedding'` models, replace the chat-oriented "Task
Fitness" bars with:

- MTEB retrieval / STS / classification / clustering scores
- Embedding dimension (with note if Matryoshka is supported)
- Max input length
- "Hosted" vs "Open weights" badge

Use a conditional in `src/app/models/[slug]/page.tsx`.

#### Admin

`src/app/admin/discover-tab.tsx` and the model detail edit page need
to know about `model_class`. Adding a new model from OpenRouter
shouldn't accidentally classify an embedding model as chat. Embedding
models aren't on OpenRouter; they come from native APIs (OpenAI,
Voyage, Cohere, Mistral) and HuggingFace (BGE, Nomic, GTE). The
admin's "Discover" flow stays chat-focused; embedding models are
added via the existing "New model" form with `model_class` selected
on creation.

### Classifier prompt

`src/prompts/classify.md` updates:

- Add `embedding` to both the top-level `task_type` enum and the
  pipeline-stage `task_type` enum (line 8 and the pipeline-stage
  variant).
- Add `embedding` to the task-type definitions section with the
  rubric: "Convert text into numerical vectors for semantic search,
  retrieval-augmented generation (RAG), clustering, or
  deduplication. The model's output is a fixed-dimensional vector,
  not generated text."
- Add a distinguishing rubric: **embedding vs extract**.
  `extract` produces structured text out (JSON, key-value pairs,
  table rows). `embedding` produces vectors used by downstream
  retrieval / similarity systems. Test: "Pull supplier/total/date
  from these invoices" → extract. "Index this document collection
  for semantic search" → embedding.
- Add two pipeline examples:
  - "Read these PDFs, embed the chunks, and use them in a chat
    interface" → extract (OCR) → embedding → conversation
  - "Build a question-answering system over our help docs" →
    embedding (the indexing stage) → research / qa (the answer
    stage, with retrieval implicit)

### Registry seed data

Initial models (subject to MTEB-grounded adjustment after ingest):

#### Hosted

| Slug | Provider | Tier | $/1M in | Dim | Max in | Notes |
|---|---|---|---|---|---|---|
| `openai-embed-3-large` | OpenAI | flagship | 0.13 | 3072 (Matryoshka 256–3072) | 8192 | strong general |
| `openai-embed-3-small` | OpenAI | budget | 0.02 | 1536 (Matryoshka 512–1536) | 8192 | cheap default |
| `voyage-3-large` | Voyage AI | flagship | 0.18 | 1024 (Matryoshka 256–2048) | 32000 | top MTEB |
| `voyage-3-lite` | Voyage AI | budget | 0.02 | 512 | 32000 | very cheap |
| `cohere-embed-v4` | Cohere | flagship | 0.12 | 1536 (Matryoshka 256–1536) | 128000 | multilingual leader |
| `mistral-embed-2` | Mistral | balanced | 0.10 | 1024 | 32000 | EU-hosted option |

#### Open (local)

| Slug | Provider | Tier | Dim | Max in | VRAM (Q8) | Notes |
|---|---|---|---|---|---|---|
| `bge-m3` | BAAI | open_source | 1024 | 8192 | 2 GB | strong multilingual |
| `nomic-embed-v2-moe` | Nomic | open_source | 768 (Matryoshka 64–768) | 2048 | 4 GB | top open English |
| `gte-qwen2-7b` | Alibaba | open_source | 3584 | 32000 | 8 GB | heavy but top-tier |

Each open model needs `local_info` with `quant_options` (the
embedding models above are small enough that Q8 is the only useful
quant — Q4 quality penalty is too high).

### Tests

- `src/lib/__tests__/registry.test.ts`: `model_class` defaults, 13
  task types in `ALL_TASK_TYPES`.
- `src/lib/__tests__/scoring.test.ts`: embedding task routes to
  embedding models only; chat task excludes embedding models.
- `src/lib/__tests__/pipeline.test.ts`: a mixed pipeline (chat → embed
  → chat) picks the right model class per stage.
- `src/lib/__tests__/benchmarks.test.ts`: MTEB category mappings
  point to `embedding` only.
- New `src/lib/__tests__/embedding.test.ts`: cost estimator returns
  input-only cost for embedding models; pricing invariant
  (output_per_1m === 0 for embedding) is enforced at registry load.

### Dataset

Dataset export already includes `task_type` and `model_class` will be
queryable via the joined models table. Add `model_class` to each
recommended/selected model record in the dataset route so consumers can
filter "embedding tasks vs chat tasks" without re-joining. Dataset
version 1.3 → 1.4.

### Public dataset / academic value

Exposing per-task embedding model selection is novel. There is no
existing public dataset that captures real-world embedding-model
choices (MTEB is benchmark-only; nobody publishes "what did people
actually pick for their RAG system"). Worth a callout in `/data`.

## Build order

This is a single coherent change. Estimated diff: 1500–2200 lines
including schema, types, scoring, prompt, registry data, ingest,
benchmarks routing, UI for /embedding, model-detail conditional,
tests, and docs.

Suggested phases (each a separate commit on the branch):

1. **Schema + types** — migration 021, `model_class` on `Model`,
   `embedding` in `ALL_TASK_TYPES`. Tests update for the 13-type
   shape. No data yet.
2. **Scoring hard filter** — route embedding tasks to embedding
   models only, exclude embedding models from chat tasks. Cost
   estimator handles input-only pricing. Tests for the routing.
3. **Registry seed** — add the 9 embedding models with hand-curated
   `task_fitness.embedding` (will be refined by MTEB ingest later).
   Regenerate `bearing-registry.json`. Bump to v0.9.0.
4. **MTEB ingest** — `scripts/ingest-mteb.ts`, `CATEGORY_TO_TASKS`
   update, aliases for the 9 models. Run ingest, verify scores.
5. **Classifier prompt** — `classify.md` updates with new task type +
   distinguishing rubric + pipeline examples. Add a classifier test
   for the embedding case.
6. **UI: /embedding entry point** — new page + form + action +
   results layout adapted for embedding metadata.
7. **UI: model detail for embedding models** — conditional layout in
   `models/[slug]/page.tsx`.
8. **UI: pipeline stage for embedding** — stage card metadata
   adapted.
9. **Dataset extension** — `model_class` on recommended models in
   export. Dataset version 1.4.
10. **Docs** — `docs/scoring/embedding-rubric.md`, changelog entry,
    `bearing-registry.json` notes.
11. **Manual QA** — run the original failing case (summarise →
    embed → analyse) and confirm a real embedding model is picked
    for stage 2.

## Open questions

1. **Pricing for partial-dimension Matryoshka.** OpenAI and Voyage
   bill the same regardless of dim. Cohere may differ. Default
   assumption: pricing is the same; document if exceptions found
   during seed.
2. **Default `priority_order` for `/embedding` mode.** Suggest
   `[quality, cost, speed, capability, privacy, transparency,
   sustainability]` — quality dominates because MTEB scores are
   the single best signal.
3. **Compare mode for embedding models.** A vs B head-to-head
   doesn't have an obvious workflow (you can't paste two queries
   and rank vectors visually). Defer; revisit if users ask.
4. **Re-rankers.** Cohere Rerank, BGE-reranker. Adjacent workload
   but a separate model class. Defer.
