# Plan — Benchmark re-ingest from the admin UI

**Date:** 2026-06-30
**Status:** ✅ Built (2026-06-23) on `feat/benchmark-reingest-admin` (stacked on
`fix/review-findings-embedding-autoroute`). All 5 phases done; tsc/lint/tests/build green.
**Branch:** `feat/benchmark-reingest-admin`

> **Implementation note:** the EcoLogits *script* (`scripts/ingest-ecologits.ts`)
> was left as-is — its dry-run preview mode is a distinct dev tool that the
> always-stores `ingestEcoLogits()` lib function doesn't replicate. Only the
> cron *route* was lifted onto the shared core, per the plan's wording.

## Goal

Let an admin trigger **re-ingestion from the live benchmark sources** from the
admin → Benchmarks tab, instead of only re-reading the DB. Today the "Refresh"
button calls `fetchBenchmarksData()`, which just re-reads `benchmark_snapshots`;
fresh data only lands when a developer runs `scripts/ingest-*.ts` from a laptop.

## Current state

| Source | Origin | Server-side fetchable? | Secrets | How it runs today |
|---|---|---|---|---|
| **ecologits** | `api.ecologits.ai` (live) | ✅ yes | none | `scripts/ingest-ecologits.ts` **+** live route `/api/admin/ecologits-refresh` (CRON_SECRET, weekly cron Mon 03:00) |
| **lmarena** | HF Datasets Server (live) | ✅ yes | optional `HF_TOKEN` | `scripts/ingest-lmarena.ts` |
| **artificialanalysis** | `artificialanalysis.ai/api/v2` (live) | ✅ yes | **`ARTIFICIAL_ANALYSIS_API_KEY`** | `scripts/ingest-artificialanalysis.ts` |
| **mteb** | hardcoded seed list (no live source; HF dataset broken) | n/a — manual curation | none | `scripts/ingest-mteb.ts` |
| **livebench** | not implemented (licence pending) | — | — | — |

Key facts from investigation:
- `ingestSnapshot()` (`src/lib/benchmarks.ts:158`) is **idempotent** — unique key
  `(source, source_category, source_model_name, snapshot_date)` with `ON CONFLICT
  DO UPDATE`. Safe to re-run; same day overwrites, new day adds a snapshot.
- The 3 live sources have **no local-file dependency** → all runnable inside a
  Vercel serverless function.
- EcoLogits already proves the pattern: `fetchEcoLogitsScore(slug, provider,
  {storeInDb:true})` is a lib function; the route just loops over models.
- **The other ingest logic lives only in the scripts** — fetch + parse + ingest +
  `console.log` are mixed together. It must be extracted to `src/lib/` to be
  callable from a server action/route.

## Scope decision

**In scope:** wire the **3 live sources** (ecologits, lmarena, artificialanalysis)
to an admin-triggered re-ingest. **mteb** surfaces as "manual / seed — no live
refresh"; **livebench** as "not available (licence pending)". Both are disabled in
the UI with explanatory text rather than hidden.

## Proposed architecture

### 1. Extract ingest cores into `src/lib/ingest/` (the real work)

Create one module per live source exposing a pure-ish async function that
fetches → parses → calls `ingestSnapshot`, returning a structured result (no
`console.log`, no `process.exit`):

```
src/lib/ingest/types.ts        // IngestResult { source, inserted, unmatched, fetched, error? }
src/lib/ingest/lmarena.ts      // ingestLmArena(opts): Promise<IngestResult>
src/lib/ingest/artificialanalysis.ts  // ingestArtificialAnalysis(opts)
src/lib/ingest/ecologits.ts    // ingestEcoLogits(opts) — wraps the existing loop in the route
```

Then **refactor the scripts to thin CLI wrappers** that import these and keep the
`--apply`/dry-run + `console.log` behaviour. This keeps the CLI working and gives
us one source of truth. (EcoLogits: lift the loop out of the route into
`ingestEcoLogits`, have both the route and the new action call it.)

### 2. Trigger: admin server actions (not new public routes)

Add to `src/app/admin/actions.ts`, each guarded by `requireAdmin()` (matches
`addBenchmarkAlias` etc.):

```ts
export async function reingestSource(source: 'lmarena' | 'artificialanalysis' | 'ecologits')
  : Promise<IngestResult>
```

Rationale: the existing `/api/admin/ecologits-refresh` route stays as the
**cron** entry point (CRON_SECRET). Admin-UI triggering goes through a server
action protected by the admin session — no second auth path to reason about.
`reingestSource('ecologits')` and the cron route both call `ingestEcoLogits`.

### 3. UI: `src/app/admin/benchmarks-tab.tsx`

- Keep the existing **Refresh** button but relabel to **"Reload view"** (it only
  re-reads the DB — current wording is what caused the confusion).
- In the per-source summary table, add a **"Re-fetch"** action per row:
  - live sources → button calls `reingestSource(source)`, shows spinner, then a
    result banner (`inserted` / `unmatched` counts) and reloads the view.
  - `mteb` → disabled, tooltip "Seed data — re-curate via script".
  - `livebench` → disabled, tooltip "Licence pending".
- Reuse the existing `feedback` banner + `isPending` pattern. **Add error
  handling** (already fixed for the plain Refresh in `4571dda`).

### 4. Config / secrets

- **Vercel env:** add `ARTIFICIAL_ANALYSIS_API_KEY` (required for AA), optionally
  `HF_TOKEN` (LMArena rate limits). Document in HANDOFF "before deploying".
- `vercel.json` cron unchanged.

## Build sequence (phases)

1. **Extract** — `src/lib/ingest/*` + refactor 3 scripts to wrappers. Verify each
   script still runs identically (dry-run diff). No behaviour change. ✅ tsc/tests.
2. **EcoLogits route refactor** — route delegates to `ingestEcoLogits`; confirm
   cron path unchanged.
3. **Server actions** — `reingestSource` in admin actions, `requireAdmin`-guarded.
4. **UI** — per-source Re-fetch buttons + relabel Refresh + result banners.
5. **Docs** — changelog, HANDOFF (new env vars), user-guide admin section.

## Decisions (locked 2026-06-30)

1. **Granularity:** ✅ **Per-source "Re-fetch" buttons.** One per source row; AA
   key failure or a single source error won't block the others; clearer feedback.
2. **Confirmation:** ✅ **Require a confirm dialog** before any live re-fetch
   ("Re-fetch lmarena now?") — it writes to the shared prod DB.
3. **Timeouts:** LMArena paginates 3 subsets (text/webdev/vision) — could exceed
   the default serverless duration. Plan: (a) bump `maxDuration`, measure; fall
   back to (b) splitting LMArena into 3 per-subset calls if needed. **Main
   technical risk.** (No input needed — implementation detail.)
4. **MTEB:** leave as script-only (manual seed re-curation); UI shows it disabled
   with an explanatory tooltip. No "re-apply seed" button.

## Status: HELD AT PLAN — awaiting review before any code is written.

## Risks / notes

- **Serverless duration** (decision 2) is the one thing most likely to bite.
- **AA API key** must be in Vercel before its button works — otherwise the action
  returns a clean "ARTIFICIAL_ANALYSIS_API_KEY not set" error (handle gracefully).
- **Cohort scaling:** LMArena/AA rows are cohort-normalised *at ingest time* per
  `(source, category, snapshot_date)`. Re-fetching a full source is fine; ingesting
  a *single* model alone would skew its cohort — but these actions always ingest the
  whole source, so no regression. (This is the same bug class the EcoLogits absolute
  curve avoided; don't add single-model live ingest for cohort-scaled sources.)
- **Idempotency** means re-running is safe; no dedup work needed.

## Out of scope

- LiveBench ingestion (licence pending).
- Live MTEB (upstream HF dataset broken).
- Scheduled crons for lmarena/AA (could add later, mirroring the ecologits cron).
