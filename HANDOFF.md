# Handoff — 2026-05-04

## What happened this session

### Public benchmarks blended into the quality factor (LMArena live, LiveBench pending)

Goal: improve the curated `task_fitness` quality factor by blending in real
benchmark data. LMArena (CC-BY-4.0) is wired end-to-end; LiveBench is on hold
pending licence clarification.

**Schema (migration 009 — applied to Neon)**
- `benchmark_snapshots` — raw per-source/category/model/date rows with
  cohort-normalised scores (0..1)
- `benchmark_aliases` — source model name → bearing slug mapping (FK ON UPDATE
  CASCADE), back-fills snapshots on insert/delete

**Ingest** (`scripts/ingest-lmarena.ts`)
- Pulls LMArena `text` / `webdev` / `vision` subsets from HF datasets-server
- Sequential fetch, 1s/2s delays, 5s→160s exponential backoff on 429/502/503/504
- Uses `HF_TOKEN` (in `.env.local`)
- Stored: 8,992 rows, latest snapshot 2026-05-01

**Aliases seeded** (`scripts/seed-lmarena-aliases.ts --apply`)
- 41 alias rows committed, covering 27 of 30 active models
- Left curated (no LMArena coverage): `ibm-granite-3.3`, `codestral-25.01`,
  `mistral-medium-3`
- Lossy proxies flagged: `greenpt-greenl ← mistral-small-3.1` (we run 3.2),
  `mistral-ocr ← pixtral-large-2411`
- 1,069 snapshot rows now matched, 140 (slug, task) blended scores ready

**Scoring blend** (`src/lib/scoring.ts`)
- New `BENCHMARK_BLEND` env var (0..1, default **0** — ships dark)
- `qualityScore(model, task, benchmarkScores, blend)` blends curated × (1−blend)
  with benchmark × blend; falls back to curated when blend ≤ 0, no map, or no
  row for `${slug}::${task}`
- Wired into both `scoreModels()` call sites in `src/app/actions.ts`
- Sync injection of the score map (no async cascade, preserves test purity)
- 3 new unit tests in `src/lib/__tests__/scoring.test.ts` — all 66 tests pass

**Admin Benchmarks tab** (`src/app/admin/benchmarks-tab.tsx`)
- Summary: rows per source, matched/total + coverage %, latest snapshot
- Aliases list with one-click remove (NULLs the snapshot bearing_slug)
- Unmatched source models, sorted by max `vote_count`, searchable, with a slug
  picker per row + "Map" action (back-fills snapshots via `upsertAlias`)
- Server actions in `src/app/admin/actions.ts`: `fetchBenchmarksData`,
  `addBenchmarkAlias`, `removeBenchmarkAlias` — all gated on `requireAdmin`

**Registry** (`src/data/bearing-registry.json`)
- Bumped 0.5.0 → 0.6.0
- Added `scoring_methodology.benchmarks` block documenting LMArena (CC-BY-4.0)
  and LiveBench (licence pending)

**LiveBench email draft**
- `docs/plans/2026-05-04-livebench-licence-request.md` — to
  `livebench@livebench.ai`, asks about (1) licensing of the
  `livebench/model_judgment` HF dataset, (2) access to the 2025-04-25 release,
  (3) preferred citation form

## What's not done yet

### Before flipping the blend on
1. **Set `BENCHMARK_BLEND=0.3` in `.env.local`** and spot-check that
   recommendation order shifts sensibly (Opus 4.7 / Sonnet 4.6 / GPT-5.4 should
   stay strong on `code` and `analyse`).
2. Decide a target blend weight (suggest 0.3 to start, raise to 0.5 once we
   have LiveBench coverage too).
3. Send the LiveBench email — draft is ready.

### After LiveBench access
- Build `scripts/ingest-livebench.ts` mirroring the LMArena script
- The category map is already in `CATEGORY_TO_TASKS.livebench` in
  `src/lib/benchmarks.ts`

### Other open work (carried from prior handoff)
- Community scoring (designed in
  `docs/plans/2026-04-13-community-scoring-design.md`, not built)
- Deploy to Vercel + production smoke test
- URL fetch + web search in Compare mode
- Trained routing model (v1.5)

## Where things are
- Repo: https://github.com/dataforaction-tom/bearing
- Branch: master — **everything in this session is uncommitted** (working tree
  changes + new files in `scripts/`, `src/lib/`, `src/app/`,
  `src/db/migrations/`, `docs/plans/`)
- Tests: 66 / 66 pass; `npx tsc --noEmit` clean
- Migrations applied to Neon: 001–009 (009 is the benchmark schema)
- Registry: 30 active models; 27 mapped to LMArena; 25 mapped to OpenRouter
- Admin: tom@good-ship.co.uk (is_admin = true)
- Key env vars: `NEON_DATABASE_URL`, `HF_TOKEN`, `BENCHMARK_BLEND` (currently
  unset → 0)
