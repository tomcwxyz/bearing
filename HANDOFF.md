# Handoff — 2026-05-29

## TL;DR

Two features shipped this session:

1. **v0.9 embedding models** — merged to master (PR #22). 41 models (31 chat + 10 embedding), `/embedding` entry point, pipeline routing, MTEB benchmark grounding.
2. **EcoLogits sustainability grounding** — open PR #23 on `feat/ecologits-sustainability`. Grounds `sustainability.inference_energy` with real GWP data, wired into admin import + weekly cron.

## Branches

| Branch | State | Notes |
|---|---|---|
| `master` | Clean — PR #22 merged | v0.9 embedding + all prior work |
| `feat/ecologits-sustainability` | 15 commits, PR #23 open | EcoLogits integration, NOT yet merged |

---

## PR #23 — EcoLogits sustainability grounding

### What it does

Integrates the [EcoLogits REST API](https://api.ecologits.ai) to ground `sustainability.inference_energy` with real per-request GWP (kgCO2eq) measurements.

**Coverage:** 10 of 31 chat models — Anthropic (haiku/sonnet/opus), OpenAI (gpt-5.4/mini/nano), Google (gemini-3-flash/3.1-pro/2.5-flash-lite), Mistral (mistral-medium-3). DeepSeek, Alibaba, Kimi, MiniMax, GreenPT, xAI, IBM not in EcoLogits.

### Key files

| File | Role |
|---|---|
| `src/lib/ecologits-grounding.ts` | Shared utility: provider map, model name resolution, GWP fetch, cohort normalisation, DB write |
| `scripts/ingest-ecologits.ts` | Batch ingest script — auto-discovers from DB, dry-run by default |
| `scripts/generate-registry.ts` | Blends ecologits scores into `inference_energy` (ECOLOGITS_BLEND env var, default 0.5) |
| `src/app/admin/actions.ts` | `estimateModelScores` + `regroundModel` both call EcoLogits automatically |
| `src/app/api/admin/ecologits-refresh/route.ts` | Protected cron endpoint — `/api/admin/ecologits-refresh` |
| `vercel.json` | Weekly cron: Monday 03:00 UTC |
| `src/db/migrations/022_ecologits_signal_type.sql` | Extends `signal_type` CHECK constraint to include `'sustainability'` |

### How it flows

```
Admin imports model
  → estimateModelScores() calls fetchEcoLogitsScore()
  → GWP fetched, normalised against existing cohort, stored in benchmark_snapshots
  → inference_energy set with teal provenance dot

Weekly cron (Monday 03:00 UTC, Vercel)
  → GET /api/admin/ecologits-refresh (Bearer $CRON_SECRET)
  → Phase 1: fetch GWP for all covered models (no writes)
  → Phase 2: ingestSnapshot(all rows) — correct cohort-wide normalisation

Every Vercel deploy (prebuild)
  → npx tsx scripts/generate-registry.ts
  → Reads latest ecologits scores from benchmark_snapshots
  → Blends into inference_energy → recalculates sustainability_score
  → bearing-registry.json updated → scoring engine sees fresh data
```

### Before merging PR #23

1. **Set `CRON_SECRET` env var in Vercel** — any random string. Required for the weekly cron and for manual curl calls to the refresh endpoint.
2. **Review the two test-plan items** that weren't verified in-session:
   - Import a new model from Discover tab → verify teal dot appears on inference_energy
   - Hit `/api/admin/ecologits-refresh` with `Authorization: Bearer $CRON_SECRET` → verify JSON summary

### Known design decisions

- **Single-model import**: `fetchEcoLogitsScore` writes with `upsertSnapshotDirect` (pre-computed normalised score, bypasses `ingestSnapshot` re-normalisation). Score is relative to cohort at time of import; the next cron run re-normalises everything correctly.
- **`ECOLOGITS_BLEND = 0.5`** by default. Set to `0` to disable blending (ecologits data fetched but not applied to scores). Set to `1` for fully EcoLogits-driven.
- **Inference-only scope**: EcoLogits excludes training energy and end-of-life. Documented in `sustainability_methodology` in registry JSON and in the rubric.

---

## Database state

Migrations applied to Neon (001–022):
- 022 — `sustainability` added to `signal_type` CHECK constraint on `benchmark_snapshots`

41 active models: 31 chat + 10 embedding.
`benchmark_snapshots` has 10 `source='ecologits'` rows, `signal_type='sustainability'`.

## Tests

183/184 pass (1 skipped — unmeetable-capability test retired in v0.8). `tsc --noEmit` clean.

## Open items

- Deploy to Vercel (both v0.9 and EcoLogits work ready)
- Set `CRON_SECRET` in Vercel env vars
- Expand EcoLogits coverage as more providers/models are added to their registry
- `ECOLOGITS_BLEND` tuning — currently 0.5; worth revisiting once data has been live for a while
- claude-opus-4.7 not yet in EcoLogits registry (no match at time of implementation)
- LiveBench licence still pending (`docs/plans/2026-05-04-livebench-licence-request.md`)
