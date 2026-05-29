# Handoff — 2026-05-29

## TL;DR

v0.9 embedding feature shipped and merged to master (PR #22). Two P1 bugs from code review fixed before merge. Docs updated. Master is clean and deployable.

## Branch state

| Branch | State |
|---|---|
| `master` | PR #22 merged — v0.9.0 embedding models fully landed |
| `feat/embedding-models` | Merged, can be deleted |

## What landed in v0.9 (PR #22)

- **Embedding models as a first-class category** — 10 models (hosted + open-weight), MTEB quality scoring, `/embedding` entry point, pipeline routing, model detail page, dataset v1.4
- **Classifier extended to 13 task types** — `embedding` added; CLASSIFY_TOOL schema fixed (was stuck on v0.7 8-value enum)
- **Two P1 bug fixes post-code-review:**
  1. `needsLongContext` was incorrectly set for embedding form submissions, causing the 100k chat context-window filter to fire against 32k embedding models. Fixed: always `false` for embedding tasks.
  2. `createTask` hardcoded `classification_schema_version = 'v0.8'` for all rows. Fixed: derives `'v0.9'` when `taskType === 'embedding'`.
- **Reasoning hardened** — `generateReasoning` now gracefully degrades on unparseable Claude output instead of crashing the results page
- **Docs updated** — `user-guide.md` (embedding section, model count 29→41), `changelog.md` (v0.9.0 + missing v0.8.0 entries), `embedding-rubric.md` (new), MTEB citation in registry JSON

## Known caveats (not bugs)

- **MTEB cohort normalisation is tight** — 10 models, raw range ~62–74. Per-cohort min-max stretches relative differences. `BENCHMARK_BLEND` env var (default 0) controls blending; revisit when cohort grows.
- **Recommend-flow embedding tasks** — when a task arrives via the generic Recommend tab (not `/embedding`) and gets classified as `task_type='embedding'`, the hard filter may apply `needs_vision`/`needs_long_context` from the full task description, potentially leaving zero top-level results (only the pipeline renders). This is correct filtering behaviour — the `/embedding` form is the right entry point for explicit embedding searches.
- **Mixed-pipeline cost footer** — for chat+embedding pipelines, the "vs single model" cost comparison is awkward (no single chat model can produce vectors). Not misleading; leave until users flag it.

## Database state

Migrations applied to Neon (001–021):
- 021 — `model_class` + embedding columns on `models`

41 active models: 31 chat + 10 embedding.
`benchmark_snapshots` has 10 `source='mteb'` rows.

## Tests

179/180 pass (1 skipped — unmeetable-capability test retired in v0.8). `tsc --noEmit` clean.

## Open items / next session ideas

- Deploy to Vercel (v0.9 ready to ship)
- Consider re-ranker models (Cohere Rerank, BGE-reranker) as a future workload category
- Multimodal embeddings (CLIP etc.) out of scope for now
- MTEB cohort: blend policy worth revisiting once >20 embedding models are in the registry
- LiveBench licence still pending (see `docs/plans/2026-05-04-livebench-licence-request.md`)
