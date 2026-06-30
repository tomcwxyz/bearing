# Auto-routing & auto-comparison — Implementation Plan

**Goal:** Evolve Bearing from an *advisor* (recommend a model, the user runs it elsewhere) into a router that can *run the user's actual prompt* against the model its scoring already picks — and auto-compare the top models (Trio / Challenger) with blind judging — without abandoning the recommend/validate/compare flows. The point is on-mission: every routed run becomes a labelled outcome row and every Trio an N-way preference judgement, multiplying the open dataset that is Bearing's core output.

**Architecture:** Bearing already owns both hard halves. The *routing signal* exists (`classifyTask` + 7-factor priority weights → `scoreModels()` returns a ranked `ScoredModel[]`). The *execution* exists (`callModel` / `callDirectProvider` run any prompt against any model; `runComparison` already fans one prompt to two models in parallel and `submitPreference` captures the verdict). The only missing wire is **scoring → execution**: today the ranked list is the terminal output; this plan makes rank #1 (or top-k) the *input to a run*. We add a thin routing helper, two server actions (`routeAndRun`, `runTrio`), an LLM-judge for blind selection, a `routed_runs` + `routed_run_models` schema to log runs as dataset rows, and UI on the existing results page. No model-calling code is rewritten — it is reused.

**Tech Stack:** Next.js 15 server actions, TypeScript, Anthropic SDK (Haiku classifier already; add a judge call), OpenRouter + direct-provider callers, Neon Postgres, Vitest. EcoLogits per-request gCO₂eq is already in the registry (`src/lib/ecologits-grounding.ts`) and is surfaced per run.

**Out of scope (deferred until the cost model is decided):**
- Sliders (Smarter / Speed / Eco) as a separate router skin — the 7-factor priority ranking is the richer equivalent; a slider mapping onto existing weights is a later, additive phase.
- On-device / pre-send PII redaction (discode markets this; `filterPrompt` is server-side only today).
- Becoming a daily-driver chat runtime with conversation history.
- Billing / BYO-key. This plan reuses the existing per-user daily quota pattern as the cost guardrail and assumes the shared OpenRouter key, exactly like `/compare` today.

---

## Phase plan

| Phase | Theme | Risk | Reuses |
|---|---|---|---|
| 0 | Routing seam: `pickRoute()` pure helper + tests | none | `scoreModels()` |
| 1 | Schema: `routed_runs` + `routed_run_models` (migration 023) | low | existing migration runner |
| 2 | `routeAndRun` server action (single best model) | medium | `callModel`/`callDirectProvider`, `buildCompareMessages`, `filterPrompt` |
| 3 | "Run it" UI on results page + footprint readout | low | `results-client.tsx`, ecologits grounding |
| 4 | Trio mode: `runTrio` + LLM-judge (blind) | medium | `runComparison` fan-out pattern, new `judge.ts` |
| 5 | Human preference capture on routed runs → dataset | low | `submitPreference` pattern, `api/dataset` |
| 6 | Quota / cost guardrails + Challenger variant | low | `DAILY_COMPARISON_LIMIT` pattern |
| 7 | Tests, docs, changelog | none | Vitest, `docs/` |

---

## Task 0: Routing seam — `pickRoute()`

The scoring already ranks; routing is just "take the top-k that can actually run." Make it explicit and tested so the server actions stay thin.

**Files:**
- Add: `src/lib/routing.ts`
- Add: `src/lib/__tests__/routing.test.ts`

**Behaviour:**
- `pickRoute(scored: ScoredModel[], opts: { k: number; runnable: (slug: string) => boolean }): ScoredModel[]`
  - Filters to models that have an OpenRouter id **or** a `DIRECT_PROVIDERS` entry (same runnable check `runComparison` does at `actions.ts:875`), then returns the top `k` by existing order.
  - Returns `[]` when nothing is runnable (caller surfaces "no runnable model for this task").
- Pure function, no I/O — the `runnable` predicate is injected so tests don't touch the DB.

**Tests:** top-1 selection; top-3 selection; skips non-runnable models without changing relative order; empty input → empty output.

---

## Task 1: Schema — `routed_runs` + `routed_run_models`

The `comparisons` table is hardwired to exactly two models (`model_a_slug` / `model_b_slug`, `preferred`), so it does not fit Trio. Add generalised tables; leave `comparisons` untouched for the manual `/compare` flow.

**Files:**
- Add: `src/db/migrations/023_routed_runs.sql`
- Modify: `src/lib/db.ts` (add `createRoutedRun`, `addRoutedRunModel`, `setRoutedRunVerdict`, `setRoutedRunPreference`, `getRoutedRun`, daily-count helper)

**Migration 023 (shape):**
```sql
CREATE TABLE IF NOT EXISTS routed_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id),
  user_id         UUID REFERENCES users(id),
  mode            TEXT NOT NULL,          -- 'route' | 'trio' | 'challenger'
  prompt_hash     TEXT,
  judged_winner   TEXT,                   -- model_slug chosen by the LLM judge (trio/challenger)
  judge_model     TEXT,                   -- which model judged
  human_preferred TEXT,                   -- model_slug the user preferred (nullable)
  preference_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routed_run_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routed_run_id   UUID REFERENCES routed_runs(id),
  model_slug      TEXT NOT NULL,
  route_rank      INT NOT NULL,           -- rank from scoreModels (1 = top)
  weighted_score  FLOAT,
  factor_scores   JSONB,
  role            TEXT NOT NULL,          -- 'primary' | 'candidate' | 'challenger'
  response_hash   TEXT,                   -- sha256 of output (we never store raw prompt/response, matching comparisons)
  est_cost        FLOAT,
  est_co2_g       FLOAT,
  latency_ms      INT,
  is_error        BOOLEAN DEFAULT false,
  error_reason    TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routed_runs_task ON routed_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_routed_run_models_run ON routed_run_models(routed_run_id);
```
- `mode` on `tasks` is free `TEXT DEFAULT 'recommend'` (no CHECK — see `001-initial-schema.sql:21`), so new modes need no migration there; `createTask` is called with `mode: 'route'`.
- Privacy parity: we store **hashes**, never raw prompt/response text — mirrors `runComparison` storing only `prompt_hash` (`actions.ts:891`).

---

## Task 2: `routeAndRun` — single best model

The advisor-→-runtime wire. Given a classified task that already has recommendations, take rank #1 runnable model and execute the user's real prompt.

**Files:**
- Modify: `src/app/actions.ts` (new `routeAndRun(taskId, formData)`)

**Behaviour (reuses existing pieces end-to-end):**
1. Auth + daily-quota check (same shape as `startComparison`, `actions.ts:778`).
2. `filterPrompt(prompt)` content gate (as `runComparison`, `actions.ts:847`).
3. Load the task's stored recommendations (or recompute via `scoreModels` from stored classification + priorities), then `pickRoute(..., { k: 1 })`.
4. Resolve runnable id + vision capability exactly as `runComparison` does (`getOpenRouterId` / `DIRECT_PROVIDERS` / `getModelFromDb`, `actions.ts:865`).
5. Build messages with the existing `buildCompareMessages` (handles PDF/CSV + vision), call `callModel`/`callDirectProvider`, measure latency.
6. Persist: `createRoutedRun(mode:'route')` + one `routed_run_models` row (role `primary`, with `route_rank`, `weighted_score`, `factor_scores`, `est_cost` from `model.estimatedCost`, `est_co2_g` from ecologits grounding, `response_hash`).
7. Increment quota only on success (mirror `bothSucceeded` logic, `actions.ts:898`).
8. Return `{ modelSlug, modelName, response, why: reasoning[slug], factorScores, estCost, estCo2g, error }`.

**Tests:** routes to top runnable model; falls through to the next when #1 is not runnable; quota not burned on model error; content-filter rejection short-circuits.

---

## Task 3: "Run it" UI + footprint readout

Make the recommendation page able to *show the answer*, with the transparent "why" that is Bearing's differentiator over discode.

**Files:**
- Modify: `src/app/recommend/[taskId]/results/results-client.tsx`
- Possibly add: `src/app/recommend/[taskId]/run/page.tsx` (or inline panel on results)

**Behaviour:**
- On the top-ranked card (`isTop`, `results-client.tsx:67`), add a **"Run this prompt"** action beside "Use this one". Opens a prompt box (+ optional PDF/CSV upload, reusing the `/compare` file widget) and calls `routeAndRun`.
- Render the response with a badge: *"Routed to **{name}** — ranked #1 on your priorities ({top factor} {pct}%)."* Reuse the per-factor bars already rendered (`results-client.tsx:122`) as the "why".
- Footprint line per run: *"~{estCo2g} gCO₂e · ~${estCost}/task"* from the ecologits-grounded value — matches discode's per-request footprint, using data Bearing already has.
- A **"Run the top 3 and judge"** secondary button → Trio (Task 4).

---

## Task 4: Trio mode — `runTrio` + blind LLM-judge

discode's Trio = three models answer one question, blind-judged. This is the existing compare fan-out widened to k=3 plus a judge.

**Files:**
- Add: `src/prompts/judge.md`
- Add: `src/lib/judge.ts`
- Modify: `src/app/actions.ts` (new `runTrio(taskId, formData)`)
- Add: `src/lib/__tests__/judge.test.ts`

**Judge (`judge.ts` + `judge.md`):**
- `judgeResponses(prompt, candidates: {label, text}[]): Promise<{ winnerLabel, reason, ranking }>`.
- **Blind:** candidates passed as anonymised labels (`A`/`B`/`C`), shuffled (no `Math.random()` in scripts is a workflow constraint, not app code — app may shuffle normally), so the judge cannot see model identity. De-anonymise after.
- Tool-use forced output, same pattern as `CLASSIFY_TOOL` (`classification.ts:80`) — typed `input`, no prose parsing. Reuse the Anthropic SDK client already used by the classifier.
- `judge.md` instructs: score against the user's task only, ignore verbosity/length bias, return winner + one-line reason + full ranking.

**`runTrio`:**
1. Auth + quota (Trio counts as one routed run for quota; document the cost — 3 inferences + 1 judge).
2. `pickRoute(..., { k: 3 })`; fan out the user's prompt to all three in parallel (the `Promise.all` pattern at `actions.ts:885`).
3. `judgeResponses` over the successful outputs.
4. Persist: `createRoutedRun(mode:'trio')` + three `routed_run_models` rows (role `candidate`), set `judged_winner` + `judge_model`.
5. Return the three responses, the blind judge's winner + reasoning, and each model's route rank/footprint.

**UI:** three-column result (reuse compare result styling), judge verdict banner, then the human-preference control (Task 5).

**Challenger variant (same infra, sequential):** route to #1, then send #1's answer to #2 with a "critique and improve this answer" prompt; store as `mode:'challenger'` with roles `primary` + `challenger`. Small wrapper over the same callers — include if Phase 4 lands cleanly, else fast-follow.

---

## Task 5: Human preference capture → dataset

Close the loop discode doesn't: capture the human verdict on routed/Trio runs and publish it.

**Files:**
- Modify: `src/app/actions.ts` (`setRoutedRunPreference(routedRunId, preferredSlug, reason)` — generalises `submitPreference`, `actions.ts:920`)
- Modify: `src/app/api/dataset/comparisons/route.ts` (or add `src/app/api/dataset/routed-runs/route.ts`) to export routed runs + verdicts (anonymised, hashes only)
- Modify the Trio/run UI to ask "which answer did you prefer?" after results

**Behaviour:** user picks a winner (or "agree with judge" / "tie"); we store `human_preferred` + `preference_reason`. The dataset endpoint emits, per routed run: task classification, priority order, candidate models with route rank + factor scores, judge winner, human winner. This is strictly richer than the current pairwise comparison export.

---

## Task 6: Quota / cost guardrails

Advising is free; routing spends real inference money. Reuse the existing guardrail, parameterised per mode.

**Files:**
- Modify: `src/app/actions.ts` (constants + `getRoutedRunCount` daily check)
- Modify: `src/app/admin/usage-tab.tsx` (surface routed-run usage alongside comparisons)

**Behaviour:** separate daily allowances, e.g. `DAILY_ROUTE_LIMIT` (single runs, cheap) and `DAILY_TRIO_LIMIT` (3× + judge, scarcer); admins uncapped (mirror `isUserAdmin`, `actions.ts:788`/`901`). Admin usage tab gains routed-run counts so cost is visible.

---

## Task 7: Tests, docs, changelog

**Files:**
- `src/lib/__tests__/routing.test.ts`, `src/lib/__tests__/judge.test.ts` (Tasks 0/4)
- `docs/user-guide.md` — new "Run it / Trio" section
- `docs/changelog.md` — entry
- `README.md` — add auto-routing + Trio to Features
- `docs/model-ratings.md` — note that routed runs + Trio verdicts now feed the dataset

**Acceptance:** `npm test` green; a routed single run and a Trio run persist correct `routed_runs`/`routed_run_models` rows; dataset export includes routed runs; no raw prompt/response text is stored anywhere (hashes only).

---

## Build order recommendation

Tasks **0 → 1 → 2 → 3** deliver the headline "discode but with transparent multi-factor routing" in the smallest reuse-heavy slice. Tasks **4 → 5** add the dataset-multiplying Trio/judge loop. Task **6** is required before exposing routing publicly (cost). Task **7** throughout. Sliders / PII redaction / daily-driver chat stay out until the cost model is decided.
