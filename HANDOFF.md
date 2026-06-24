# Handoff — 2026-06-30

## TL;DR

A review-fix + lint-cleanup session on top of the merged v0.9 work. Four commits
on **`fix/review-findings-embedding-autoroute`** (pushed, in sync with origin at
`bc8c71f`, **no PR yet**). `tsc` clean, **186/187 tests pass** (1 skipped),
**`npm run lint` now reports 0 problems** (was 876). Also scoped — but did **not**
build — an admin benchmark re-ingest feature (plan written, held for review).

Registry unchanged: **v0.9.0, 41 models (31 chat + 10 embedding), 17 providers.**

## What shipped this session (branch `fix/review-findings-embedding-autoroute`)

### 1. Embedding review-fix refactor (`c7b8de3`)
Follow-up cleanup on the merged auto-route work (PR #24). No behaviour change.
- **`scoring.ts` hardFilter**: long-context is now a **chat-only gate**
  (`!wantsEmbedding && …`) — callers no longer have to remember to zero
  `needsLongContext` for embeddings. Proper fix for the bug class behind
  `897b47e`/`a445591`; regression test added.
- **New `src/lib/model-class.ts`**: `ModelClass`/`MODEL_CLASSES`/`isModelClass`
  extracted out of `registry.ts` so client components import the runtime array
  without pulling registry JSON into the client bundle. `registry.ts` re-exports.
- **New `src/lib/pricing.ts`**: `embeddingPriceLabel()` single source of truth for
  the "Free (self-host)" / `$X/1M` wording.
- **`actions.ts`**: shared `maybeRouteEmbedding()` (dedups submitTask /
  submitClarification), paired `hosting⇄data_sensitivity` encoders, and
  `complexity` threaded through `scoreAndSaveEmbedding` so saved rankings match
  the results-page re-score.
- **`models-list.tsx`**: `resetFilters()` helper; uses `MODEL_CLASSES` /
  `embeddingPriceLabel`.

### 2. Lint cleanup — 876 → 0 (`48dff9e`, `bc8c71f`)
- **`npm run lint` was linting generated MkDocs output** (`site/`, gitignored).
  Flat config doesn't read `.gitignore`, so **863 of 876 problems were minified
  vendor JS**. Added `site/**` to `globalIgnores` + configured `no-unused-vars`
  with `ignoreRestSiblings` + `^_` patterns.
- Cleared the **13 real source errors** (deploy-blocking — `next.config.ts` has no
  `eslint.ignoreDuringBuilds`): JSX entity escapes, `<a href="/">`→`<Link>`, dead
  `taskType` state removed, `loaded` flag → `useRef` guard, documented
  `set-state-in-effect` disables on browser-only mount reads, `db.ts`
  `modelRowToModel` typed off `any`, script `require`/`any` fixes.

### 3. Admin benchmark-refresh robustness (`4571dda`)
The Benchmarks-tab **Refresh** handler had no error handling — a failed
`fetchBenchmarksData()` died as a silent unhandled rejection (button just stopped
spinning). Now catches and shows it in the feedback banner, like the alias
handlers. **NB: Refresh only re-reads the DB; it does NOT fetch from sources** —
that confusion led to the plan below.

## Benchmark re-ingest feature — SCOPED, NOT BUILT

Plan: **`docs/plans/2026-06-30-benchmark-reingest-admin.md`** (untracked).
- Goal: admin-triggered **re-fetch from live sources**, not just re-read the DB.
- **3 of 5 sources are server-side fetchable** (live APIs, no local files):
  `ecologits` (already has `/api/admin/ecologits-refresh`), `lmarena` (HF Datasets
  Server, optional `HF_TOKEN`), `artificialanalysis` (needs
  `ARTIFICIAL_ANALYSIS_API_KEY`). `mteb` = hardcoded seed (no live source);
  `livebench` = not implemented (licence pending). Both shown disabled + explained.
- **Core work** = extract ingest logic from `scripts/ingest-*.ts` into
  `src/lib/ingest/*` (today it's tangled with `console.log`), then add
  `requireAdmin`-guarded `reingestSource()` server actions + per-source UI buttons.
- **Decisions locked:** per-source buttons; confirm dialog before each live
  re-fetch; MTEB stays script-only; relabel current "Refresh" → "Reload view".
- **Main risk:** serverless timeout (LMArena paginates 3 subsets) — bump
  `maxDuration`, measure, split if needed.
- **Status: HELD AT PLAN.** Phase 1 (the no-behaviour-change extraction) is ready
  to start on the user's go.

## Branch / git state

- `fix/review-findings-embedding-autoroute` — 4 commits ahead of master, **pushed**
  (origin in sync at `bc8c71f`), **no PR opened yet**.
- Untracked, intentionally not committed: `docs/plans/2026-06-30-benchmark-reingest-admin.md`
  (this session's plan), two older `docs/plans/2026-05-29-*.md`, four
  `data/backups/task_fitness_pre_v0.8.0_*.json`, `.claude/`.

## Open items (carried forward)

- **Open a PR** for `fix/review-findings-embedding-autoroute` (or merge locally).
- **Deploy to Vercel** — needs `CRON_SECRET` (guards the weekly EcoLogits cron).
  If the re-ingest feature ships, also add **`ARTIFICIAL_ANALYSIS_API_KEY`** and
  optionally **`HF_TOKEN`**.
- Two EcoLogits test-plan items still unverified: teal provenance dot on admin
  import, and a live hit to the refresh endpoint with the Bearer secret.
- Build the benchmark re-ingest feature (plan ready) when approved.
- `ECOLOGITS_BLEND` tuning (0.5); claude-opus-4.7 not yet matched in EcoLogits;
  22 curated models still on absolute rubric anchors; LiveBench licence pending.
