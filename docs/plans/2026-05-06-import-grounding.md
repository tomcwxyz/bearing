# Plan: Ground OpenRouter import scores in real benchmarks

**Date:** 2026-05-06
**Branch:** `feature/import-grounding` (off `master`)
**Status:** Phase 0 in progress

## Problem

`estimateModelScores` (`src/app/admin/actions.ts:172`) sends Haiku
the OpenRouter metadata for a new model and accepts whatever JSON it
returns for `tier`, `task_fitness`, `speed_score`, `privacy_score`,
`transparency.*`, and `sustainability.*`. None of these are grounded
in published benchmarks. Imported models ship with hallucinated
scores that can recommend the wrong models.

We already ingest LMArena and LiveBench into `benchmark_snapshots`
(see `src/lib/benchmarks.ts`) and blend them into `task_fitness` at
recommendation time, but this pipeline is not consulted during
import. Artificial Analysis is not yet a source.

## Goal

At import time, derive every score that has an objective public
source from that source. Use Haiku only for fields with no published
signal. Surface provenance so admins can see which numbers are
evidence-based.

## Sources

1. **LMArena** (already ingested).
2. **LiveBench** (already ingested).
3. **Artificial Analysis** (new) —
   `https://artificialanalysis.ai/api/v2/data/llms/models` with
   `x-api-key` header. Docs:
   <https://artificialanalysis.ai/api-reference#models-endpoint>.
   513 models with per-model `evaluations` (intelligence, coding,
   math indices plus mmlu_pro, gpqa, hle, livecodebench, scicode,
   tau2, ifbench, aime_25, terminalbench_hard, lcr, math_500),
   `median_output_tokens_per_second`,
   `median_time_to_first_token_seconds`, `pricing`, `slug`.

## Decisions made (Phase 0 prep)

1. **No automatic tier derivation.** AA intelligence vs curated tier
   overlaps too heavily across the 29 registry models — `gpt-5.4-nano`
   (budget, intel 44) outscores `mistral-medium-3` (balanced, 18.8).
   Tier reflects provider positioning, not absolute capability.
   Tier remains an admin dropdown, defaults to `balanced` on import.
2. **Many-to-one alias model** — one bearing slug can map to multiple
   AA variants (e.g. Claude Haiku 4.5 → both `claude-4-5-haiku` and
   `claude-4-5-haiku-reasoning`). Existing schema supports this
   (unique key is on `source_model_name`, not `bearing_slug`).
3. **Admin confirms candidate aliases.** The matcher returns ranked
   suggestions with reasons; admin checks the right ones. False
   suggestions are cheap; false rejections are expensive.

## Phases

### Phase 0 — AA matcher and alias suggester ⬅ now

Build `src/lib/import-grounding.ts` exposing:

```ts
suggestBenchmarkAliases(
  bearing: { slug: string; name: string; provider: string },
  source: BenchmarkSource,
  candidates: { name: string; slug?: string }[],
): { name: string; slug?: string; score: number; flags: string[] }[]
```

Matching:
- Strip parenthetical suffixes — but treat their content separately
  so `(Reasoning)`, `(Non-reasoning)`, `(Sep '25)`, effort markers
  don't pollute the main token bag.
- Outside parens, strip product-suffix noise (`Distill`, `Instruct`,
  `Chat`, `Terminus`, `Speciale`, `Thinking`, `Preview`, dates).
- Hyphens/underscores → spaces.
- Compress `family + space + version-digit` so `Qwen 3 235B` matches
  `qwen3 235b`.
- Score with `|intersection| / min(|q|, |aa|)`, threshold 0.85.
- Don't reject candidates with extra "size disambiguators" (`mini`,
  `nano`, `vl`, `distill`, etc.) — flag them in the reason and let
  the admin pick.
- Hard-skip a "no AA coverage" allowlist (`greenpt-*`, `mistral-ocr`,
  `codestral-*`, `devstral`, `ibm-granite-*`).

Tests in `src/lib/__tests__/import-grounding.test.ts` against a
fixture AA payload.

### Phase 1 — AA ingester
- `scripts/ingest-artificialanalysis.ts` fetches the endpoint,
  writes one snapshot per (model, eval-key) plus `aa_speed`/`aa_ttft`
  rows.
- Add `'artificialanalysis'` to `BenchmarkSource`. Extend
  `CATEGORY_TO_TASKS`.
- `010-aa-signals.sql` adds `signal_type` enum column to
  `benchmark_snapshots` (default `'task'`), so speed/TTFT can ride
  the same table.
- `scripts/seed-aa-aliases.ts` seeds initial aliases for the 29
  registry models using the Phase 0 matcher.

### Phase 2 — Suggestions in import modal
- `discover-tab.tsx` gains a "Benchmark matches" panel above Generate
  Estimates. For each source, top 5 candidates with checkboxes; admin
  confirms. Saving writes to `benchmark_aliases`.
- Show flag badges on each candidate (`distill`, `vl`, etc.).

### Phase 3 — Grounded estimation
Refactor `estimateModelScores`:
1. Read benchmark scores via `getLatestBenchmarkScores()` plus
   `getLatestPerformanceSignals(slug)` (new) for AA speed/TTFT.
2. Deterministic mapping for grounded fields:
   - `task_fitness[task]` ← weighted mean of mapped categories.
   - `speed_score` ← AA `median_output_tokens_per_second` cohort-
     normalised.
   - `privacy_score` ← static provider table.
   - `tier` stays admin-set (default `balanced`).
3. Haiku fills gaps with benchmark numbers in the prompt; explicitly
   forbidden from overriding grounded fields.
4. Return provenance per field.

### Phase 4 — UI provenance + re-grounding
- Source badges on each slider in the import modal and edit page.
- "Refresh from benchmarks" button on edit page.
- Warning on import if a flagship-priced model has zero benchmark
  coverage.

### Phase 5 — Tests + re-grounding the existing 29
- Unit tests for the matcher and the grounded merge.
- Integration test for end-to-end import.
- Manual: re-run grounded estimation against the existing 29 models
  with admin review pass.

## Files

**New:** `src/lib/import-grounding.ts`,
`src/lib/__tests__/import-grounding.test.ts`,
`scripts/ingest-artificialanalysis.ts`, `scripts/seed-aa-aliases.ts`,
`src/db/migrations/010-aa-signals.sql`.

**Modified:** `src/lib/benchmarks.ts`, `src/app/admin/actions.ts`,
`src/app/admin/discover-tab.tsx`,
`src/app/admin/edit/[slug]/page.tsx`, `src/prompts/estimate-model.md`.

## Out of scope

- Replacing `getLatestBenchmarkScores()` blend logic.
- New task types beyond the existing 8 + `agentic`.
- Public benchmark page.
