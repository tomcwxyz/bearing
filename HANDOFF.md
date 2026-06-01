# Handoff — 2026-06-01

## TL;DR

Both feature branches from the previous session are now **merged to master**, plus
a follow-up session of review fixes, an EcoLogits scoring overhaul, an embedding
UX redesign, docs, and branch cleanup. **master is the only branch** (local + remote).
Working tree clean. `tsc` clean, 185/186 tests pass (1 skipped).

Registry: **v0.9.0, 41 models (31 chat + 10 embedding), 17 providers.**

## What shipped this session (all on master)

### 1. EcoLogits — absolute GWP curve + provenance (PR #23, merged `a81091c`)
Replaced cohort min-max normalisation with a **fixed absolute log curve**
(`gwpToScore`, `src/lib/ecologits-grounding.ts`): `0.01 gCO₂eq → 1.0`,
`2.5 gCO₂eq → 0.0`. Scores are now cohort-independent.
- Every model's `sustainability.inference_energy_source` records provenance:
  `{source:'ecologits', blend, eco_score, raw_gwp_gco2eq, eco_model, snapshot_date}`
  or `{source:'curated'}`. Type `InferenceEnergyProvenance` in `registry.ts`.
- Simplified the pipeline: removed `getCohortStats`; cron route now stores per-model
  via `fetchEcoLogitsScore(...,{storeInDb:true})` (no two-phase batch); `ingestSnapshot`
  gained an additive pre-computed `normalisedScore` path (cohort logic untouched for AA).
- **Resolved P1 review** (single-row ingest collapsing scores to 0) — that was the old
  cohort code; absolute scoring eliminates the bug class. Do NOT re-add batching.

### 2. Embedding UX — auto-route + Models entry point (PR #24, merged `4a6e9a6`)
- **Auto-routing**: describe an embedding task in the normal flow → `submitTask` /
  `submitClarification` route to `/embedding/[id]/results`, skipping the chat priority
  page. Shared `scoreAndSaveEmbedding` + `prepareEmbeddingRecommendation` helpers in
  `actions.ts`; `submitEmbeddingTask` refactored onto them.
- Front-page **Embedding tab removed** (`mode` = recommend | validate) + auto-detect hint.
- Models registry: **Chat/Embedding type filter** + "Find an embedding model" CTA;
  `/models?type=embedding` deep-link. Embedding cards hide N/A output pricing.
- **Resolved 2 reviews**: (P1) embedding-led *pipelines* no longer shortcut to the
  single-model page — gated on `!hasPipelineStages` so `getResults()` renders every
  stage; (P2) `getEmbeddingResults` hardcodes `needsLongContext: false` so the chat
  100k context gate never drops embedding models.

### 3. Docs + cleanup
- `docs/changelog.md` (`[Unreleased]`) + `docs/user-guide.md` updated for both features.
- **README fully refreshed** (`71abdc7`) — was v0.5.0-era: now v0.9.0, 41 models,
  embedding section, EcoLogits/MTEB, Next.js 16, 185 tests, migrations 001–022.
- **All stale branches deleted** (7 remote, 4 local). Only `master` remains.

## Before deploying

- **Set `CRON_SECRET` in Vercel** — guards `/api/admin/ecologits-refresh` (weekly cron,
  Mon 03:00 UTC via `vercel.json`). Required before the cron or manual refresh works.
- Two EcoLogits test-plan items still unverified in-session: teal provenance dot on
  admin import, and a live hit to the refresh endpoint with the Bearer secret.

## Database state

Migrations applied to Neon: **001–022** (022 = `sustainability` signal_type).
`benchmark_snapshots` has 10 `source='ecologits'` rows (`signal_type='sustainability'`),
now scored on the absolute curve.

## Open items (carried forward)

- Deploy to Vercel (everything ready; needs `CRON_SECRET`).
- `ECOLOGITS_BLEND` tuning — currently 0.5; revisit once data has been live a while.
- Methodology follow-up: 22 curated (non-EcoLogits) models still use absolute rubric
  anchors. Grounded + curated now share one axis, but recurating the uncovered models
  for full consistency is optional future work.
- claude-opus-4.7 not yet matched in the EcoLogits registry.
- Expand EcoLogits coverage as their model registry grows.
- LiveBench licence still pending (`docs/plans/2026-05-04-livebench-licence-request.md`).
- Minor: `embeddingPriorityFor` / auto-route mapping has no unit test (server-action,
  needs LLM+DB) — verified manually via Playwright. Could extract a pure helper to test.
