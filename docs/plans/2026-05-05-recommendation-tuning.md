# Recommendation Tuning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Bearing's recommendations responsive to task type, complexity, and user priorities — so frontier models surface for hard work, cheap models surface for cheap work, and constraints like on-prem-only or realtime are honoured.

**Architecture:** Tightens three layers without restructuring them. (1) Registry: re-grade `task_fitness` so quality has real dynamic range. (2) Scoring: priority-aware weight compression, complexity-tier floors, hard filters for on-prem / latency / context. (3) Classification: new dimensions (`data_sensitivity`, `latency_target`, `volume`, `needs_reasoning`, etc.) and a tighter pipeline rule. The existing test battery (`scripts/test-recommendations.ts`) becomes the regression baseline between phases.

**Tech Stack:** TypeScript, Next.js server actions, Anthropic SDK (Haiku 4.5 classifier), Neon Postgres, Vitest.

---

## Phase plan

| Phase | Theme | Risk | Expected impact |
|---|---|---|---|
| 0 | Lock the regression baseline | none | Enables before/after diffing |
| 1 | Registry quality recalibration | medium (data only) | Frontier models become recommendable |
| 2 | Cost curve + priority-aware weight compression | medium | Top-3 actually shifts with priority order |
| 3 | Complexity → tier floor + reasoning multiplier | low | Complex tasks stop getting budget models |
| 4 | New classification dimensions (additive) | medium | Privacy / latency / volume / reasoning surface |
| 5 | Hard filters wired in scoring | low | On-prem, realtime, long-context honoured |
| 6 | Pipeline detection tightened | low | Chatbots and refactors stop getting 4-stage pipelines |
| 7 | Classifier robustness (JSON parse, output_length, subtype) | low | No more silent crashes on $/ms/etc |
| 8 | Final regression + write-up | none | Documents what changed |

Commit at the end of every task. Re-run `npx tsx scripts/test-recommendations.ts` at the end of every phase and compare against the Phase-0 baseline.

---

## Phase 0 — Lock the baseline

### Task 0.1: Promote the test script to a versioned baseline

**Files:**
- Modify: `scripts/test-recommendations.ts`
- Create: `scripts/baselines/2026-05-05-baseline.json`

**Step 1:** Run the script once with current code:

```bash
npx tsx scripts/test-recommendations.ts
```

**Step 2:** Copy `test-recommendations-output.json` → `scripts/baselines/2026-05-05-baseline.json`. This is the "before" snapshot.

**Step 3:** In `test-recommendations.ts`, also write an `expected` field per prompt (already present) and add a `--diff <baseline-path>` flag that compares the current run's top-3 model slugs per prompt against the baseline and prints a colour-coded diff (added / removed / reordered). Keep it simple — `JSON.parse + Set diff` is enough.

**Step 4:** Commit:

```bash
git add scripts/test-recommendations.ts scripts/baselines/
git commit -m "test: lock recommendation baseline for tuning work"
```

**Acceptance:** `npx tsx scripts/test-recommendations.ts --diff scripts/baselines/2026-05-05-baseline.json` reports zero diffs.

### Task 0.2: Add a Vitest unit-test for the most surprising current behaviour

**Files:**
- Create: `src/lib/__tests__/scoring-tuning.test.ts`

These are **regression-pinning tests** — they assert today's (wrong) behaviour, not the desired behaviour. Phase 2 will flip them.

```ts
import { scoreModels } from '../scoring'

describe('scoring tuning baseline (will flip in Phase 2)', () => {
  it('currently does NOT recommend Claude Opus for complex code with quality-first priorities', () => {
    const result = scoreModels({
      taskType: 'code',
      complexity: 'complex',
      inputLength: 'long',
      needsVision: false, needsTools: true, needsCode: true,
      priorityOrder: ['quality','capability','cost','transparency','privacy','sustainability','speed'],
    })
    const top3 = result.slice(0,3).map(m => m.slug)
    expect(top3).not.toContain('claude-opus-4.6')   // baseline behaviour
  })

  it('currently recommends a cloud model even when default priorities apply to a privacy-sensitive task', () => {
    // Documents the bug: privacy is rank-5 by default, so even moderate cloud
    // wins. Phase 4 introduces data_sensitivity to fix this.
    const result = scoreModels({
      taskType: 'analyse',
      complexity: 'complex',
      inputLength: 'long',
      needsVision: false, needsTools: false, needsCode: false,
      priorityOrder: ['quality','capability','cost','transparency','privacy','sustainability','speed'],
    })
    expect(result[0].provider).not.toBe('on-prem-only')   // tautology, just locks the shape
  })
})
```

**Step 5:** Run `npx vitest run src/lib/__tests__/scoring-tuning.test.ts`. Expected: PASS (locking baseline).

**Step 6:** Commit:

```bash
git commit -am "test: pin baseline scoring regressions (to be flipped in later phases)"
```

---

## Phase 1 — Registry quality recalibration (data only)

**Hypothesis:** widening the spread of `task_fitness` between flagship/balanced/budget tiers will let frontier models out-score budget models on complex tasks.

### Task 1.1: Document the target rubric

**Files:**
- Create: `docs/scoring/task-fitness-rubric.md`

Write the rubric so future grading is consistent. Suggested anchors:

```
0.95–1.00  best-in-class on this task type, definitively SoTA
0.88–0.94  strong frontier, very close to SoTA but not the leader
0.78–0.87  capable balanced/mid-tier — solid for medium complexity
0.65–0.77  budget tier — fine for simple tasks, struggles on complex
0.50–0.64  weak / specialist mismatch
< 0.50     don't recommend for this task type
```

**Step 1:** Commit the rubric.

### Task 1.2: Re-grade flagship-tier models

**Files:**
- Modify: `src/data/bearing-registry.json`

Targets (apply only on this model's strong tasks; leave weak tasks alone):

| Model | code | analyse | generate | summarise | extract |
|---|---|---|---|---|---|
| claude-opus-4.6 | 0.96 | 0.97 | 0.96 | 0.93 | 0.90 |
| claude-sonnet-4.6 | 0.93 | 0.91 | 0.92 | 0.90 | 0.88 |
| gpt-5.4 | 0.96 | 0.93 | 0.91 | 0.88 | 0.88 |
| gemini-3.1-pro | 0.91 | 0.95 | 0.88 | 0.92 | 0.90 |
| grok-4 | 0.92 | 0.94 | 0.87 | 0.85 | 0.83 |

**Step 1:** Edit JSON. **Step 2:** Run `npx tsc --noEmit` (registry is statically typed). **Step 3:** Run unit tests. **Step 4:** Commit `chore(registry): widen flagship task_fitness range`.

### Task 1.3: Re-grade balanced and budget tiers down

**Files:**
- Modify: `src/data/bearing-registry.json`

| Model | Change |
|---|---|
| gemini-3-flash | code 0.88→0.82, analyse 0.82→0.78 (it's balanced, not flagship) |
| gpt-5.4-mini | hold |
| claude-haiku-4.5 | hold (already at 0.80 / 0.72) |
| llama-4-maverick | code 0.84→0.81, analyse 0.78→0.76 |
| ibm-granite-3.3 | code 0.78→0.70, analyse 0.72→0.65 |
| greenpt-greenl | code 0.72→0.66, analyse 0.65→0.60 |
| greenpt-greenr | code 0.78→0.72, analyse 0.75→0.70 |
| qwen3.5-397b | analyse 0.82→0.85 (strong reasoning; bump) |
| deepseek-r1 | analyse 0.88→0.93 (reasoning specialist; bump) |
| codestral-25.01 | code 0.95→0.92 (still leader for pure code, but not over Opus/GPT-5.4) |

**Step 1:** Edit JSON. **Step 2:** Re-run regression: `npx tsx scripts/test-recommendations.ts --diff scripts/baselines/2026-05-05-baseline.json`. Expected: Opus / GPT-5.4 / Sonnet appear in top 3 for at least the `code-hard`, `analyse-legal`, `analyse-strat`, `gen-creative` prompts. **Step 3:** Commit.

### Task 1.4: Re-run benchmark blend sanity check

LMArena snapshots blend in at 30%. After the curated change, check that benchmark coverage isn't fighting the new curated grades. If a blended slug (e.g. `claude-opus-4.6::code`) now has a curated 0.96 but a normalised LMArena score of 0.78, the blend pulls it back to 0.91.

**Step 1:** Run `node -e` to print the blend delta for each (slug, task) pair where a benchmark row exists. **Step 2:** If any flagship is dragged below balanced-tier curated scores, decide: lower the BENCHMARK_BLEND default for now (0.3 → 0.2), or skip blending for slugs where curated > benchmark by > 0.10. Pick the simpler one; document choice in `src/lib/scoring.ts` comment. **Step 3:** Commit.

---

## Phase 2 — Cost curve + priority-aware weight compression

### Task 2.1: Make cost-score steepness depend on cost weight

**Files:**
- Modify: `src/lib/scoring.ts` (`costScore` function)
- Modify: `src/lib/__tests__/scoring.test.ts`

**Current:** log-scale, floor 0.05, weight applied externally. The penalty for an expensive model is fixed regardless of where the user ranked cost.

**New:** pass the user's cost *weight* (or rank) into `costScore`. When cost is low-priority (rank 4+), compress the curve so an expensive model scores no worse than 0.40 instead of 0.05.

```ts
function costScore(model, allModels, inputLength, costWeightHint = 0.18): number {
  // ... existing log calculation produces baseScore in [0,1]
  // Compression: when costWeightHint is small, pull baseScore towards 0.5.
  const compression = Math.max(0, 1 - costWeightHint / 0.30)   // 0 when weight ≥0.30, up to 1 when weight≈0
  return baseScore + (0.5 - baseScore) * compression * 0.6
}
```

**Step 1:** Write 2 unit tests: (a) when cost weight is 0.30, expensive flagship still scores ≤ 0.10; (b) when cost weight is 0.05 (last priority), expensive flagship scores ≥ 0.30. **Step 2:** Implement. **Step 3:** Update call sites in `scoreModels`. **Step 4:** Run `npx vitest run`. **Step 5:** Commit.

### Task 2.2: Compress non-priority factor weights

**Files:**
- Modify: `src/lib/weights.ts`

When a factor is **rank 5+** in the user's priority order, multiply its raw weight by 0.4 before normalisation. This stops transparency/sustainability/privacy from quietly dominating when the user clearly didn't care about them.

```ts
const LOW_PRIORITY_DAMP = 0.4
for (let i = 4; i < priorityOrder.length; i++) {
  raw[priorityOrder[i]] *= LOW_PRIORITY_DAMP
}
```

**Step 1:** Write a test: with priorities `['quality','capability','cost','speed','transparency','sustainability','privacy']`, transparency weight after normalisation < 0.05. **Step 2:** Implement. **Step 3:** Run regression battery. Expect Opus / GPT-5.4 to now top quality-first prompts. **Step 4:** Flip the Phase-0 pinning tests: assertion changes from `not.toContain('claude-opus-4.6')` → `toContain('claude-opus-4.6')`. **Step 5:** Commit.

### Task 2.3: Re-run regression + update baseline

**Step 1:** Compare new output to `2026-05-05-baseline.json`. **Step 2:** Save fresh snapshot as `scripts/baselines/2026-05-05-phase2.json`. **Step 3:** Commit baseline.

---

## Phase 3 — Complexity → tier floor + reasoning multiplier

### Task 3.1: Tier floor for complex tasks

**Files:**
- Modify: `src/lib/scoring.ts`

Rule: when `complexity === 'complex'`, set `factorScores.quality *= 0.85` for any model with `tier ∈ {'budget','sustainable_balanced','enterprise_transparent'}` *unless* the user ranked sustainability/transparency in their top 3. (Respect the user's ethical preferences.)

**Step 1:** Test: complex code task with default priorities — Granite Micro / GreenPT GreenL drop out of top 5. **Step 2:** Implement. **Step 3:** Run battery. **Step 4:** Commit.

### Task 3.2: Reasoning multiplier

**Files:**
- Modify: `src/lib/scoring.ts`
- Modify: `src/prompts/classify.md` (add `needs_reasoning` to schema)
- Modify: `src/lib/classification.ts` (add field to interface)
- Modify: `src/app/actions.ts` (persist field)
- Migration: `src/db/migrations/010_needs_reasoning.sql` — `ALTER TABLE tasks ADD COLUMN needs_reasoning BOOLEAN DEFAULT FALSE`

When `needsReasoning && model.capabilities.includes('extended_thinking')`, multiply quality by 1.20.

**Step 1:** Write migration; apply to Neon (use `psql $NEON_DATABASE_URL -f …`). **Step 2:** Update classifier prompt with examples (math symbolic, multi-step strategy, legal risk). **Step 3:** Update `Classification` interface and DB plumbing. **Step 4:** Update scoring + tests. **Step 5:** Run battery; expect DeepSeek R1 / Opus to surface for prompt #17 (PDEs) and #18 (German market expansion). **Step 6:** Commit.

---

## Phase 4 — New classification dimensions

These all follow the same pattern: prompt update → interface field → DB column → scoring use. One commit per dimension keeps reverts easy.

### Task 4.1: `data_sensitivity`

**Schema:** `'none' | 'pii' | 'regulated_health' | 'regulated_finance' | 'on_prem_required'`

- Migration `011_data_sensitivity.sql`
- Classifier prompt: examples for "patient records", "credit-card data", "must run on-prem"
- Scoring: `on_prem_required` → hard filter to models with `local_info != null`; `regulated_*` → multiply `factorScores.privacy` by 1.5×; `pii` → multiply by 1.2×

**Note on landing**: applied as score multipliers, not weight multipliers. Cleaner drop-in into `scoreModels`'s per-model loop without restructuring `priorityToWeights`. Documented inline in `src/lib/scoring.ts`.

**Acceptance:** prompt #30 (medical, on-prem) top recommends a Llama / Granite / Mistral with `local_info`, not Gemini.

### Task 4.2: `latency_target`

**Schema:** `'realtime' | 'interactive' | 'batch'` (default `'interactive'`)

- Migration `012_latency_target.sql`
- Prompt: "voice assistant under 200ms" → realtime
- Scoring: `realtime` → hard filter `speed_score >= 0.85`; `batch` → multiply `factorScores.cost` by 1.3 (score multiplier — see Task 4.1 note)

**Acceptance:** prompt #34 returns only fast tier; prompt #20 (bulk translate) drops cost-heavy models.

### Task 4.3: `volume`

**Schema:** `'one_off' | 'hundreds_per_day' | 'thousands_per_day' | 'millions_per_day'`

- Migration `013_volume.sql`
- Scoring: `thousands_per_day` → multiply `factorScores.cost` by 1.3; `millions_per_day` → 1.6 (score multiplier — see Task 4.1 note). When latency=batch and volume>=thousands both apply, take `max()` not the product — they're aliasing the same "cost matters more" signal, not stacking.

**Acceptance:** prompt #33 (1M tweets/day under $50/month) recommends cheapest-viable tier.

### Task 4.4: `needs_long_context`

**Schema:** boolean

- Migration `014_needs_long_context.sql`
- Scoring: hard filter `context_window >= 100_000`

**Acceptance:** prompt #6 (200-page board report) excludes any 8k-context model from results.

### Task 4.5: `needs_multilingual` and `is_agentic`

Lighter-touch fields. Multilingual → multiplier 1.10 if `multilingual ∈ capabilities`. Agentic → multiplier 1.15 if `tools ∈ capabilities` and `extended_thinking ∈ capabilities`.

### Task 4.6: `output_length` separate from `input_length`

- Migration `015_output_length.sql`
- Cost estimation already uses both implicitly via `TOKEN_ESTIMATES`, but only one input string. Refactor `estimateCost` to take `(inputLength, outputLength)` separately.

---

## Phase 5 — Wire hard filters cleanly

### Task 5.1: Centralise hard filters in scoring

**Files:**
- Modify: `src/lib/scoring.ts`

Currently `capabilityScore` returns `null` to drop a model. Generalise: a single `hardFilter(model, input): { ok: boolean; reason?: string }` so it's testable in isolation. Reasons are returned through the API so the UI can show "5 models excluded because they require cloud hosting".

**Step 1:** Write tests for each filter. **Step 2:** Refactor. **Step 3:** Update `getResults` action to surface filter reasons in the response. **Step 4:** Render in `recommend/[id]/results` page (one-line summary). **Step 5:** Commit.

---

## Phase 6 — Pipeline detection tightening

### Task 6.1: Tighten the pipeline rule in the prompt

**Files:**
- Modify: `src/prompts/classify.md`

Replace the current "2+ distinct operations" rule with:

```
A pipeline requires ≥2 operations that:
  1. Have different task_type values, AND
  2. Cannot share a single model efficiently — i.e., the operations
     genuinely differ in modality (vision → text), language (translate → analyse),
     or specialty (OCR → reasoning).

NEVER recommend a pipeline for:
  - A single chat / conversation / chatbot use case (chatbots are not pipelines)
  - Code that involves writing + testing + refactoring (one job)
  - A single document being summarised
  - Anything where the same general-purpose model could do all stages
```

Add 4 negative examples to the prompt: GCSE tutor chatbot, customer-support chatbot, code refactor with tests, multilingual chatbot.

**Step 1:** Update prompt. **Step 2:** Re-run battery. Expect ≤ 5 of 32 prompts now pipeline (currently 13). **Step 3:** Add a test in `src/lib/__tests__/classification.test.ts` that asserts a chatbot prompt does not produce a pipeline (uses `buildClassificationMessages` + a recorded fixture; do not call the live API in tests). **Step 4:** Commit.

---

## Phase 7 — Classifier robustness + minor cleanup

### Task 7.1: Use Anthropic structured-output instead of raw-JSON parse

**Files:**
- Modify: `src/lib/classification.ts`

Currently `JSON.parse(rawText.replace(/```/g,''))`. Two prompts crashed on this. Use the SDK's tool-use to force a structured response — define `classify_task` as a tool with the schema, and read the tool input. Eliminates the regex-cleaning fragility.

**Step 1:** Write a test using `buildClassificationMessages` + a stubbed Anthropic response containing prose around JSON; assert it still parses (records the bug). **Step 2:** Refactor to tool-use. **Step 3:** Run live against the 2 previously-failing prompts (#33, #34). **Step 4:** Commit.

### Task 7.2: Drop `task_subtype` OR map it to weights

Two options:

**(a)** Drop `task_subtype` from the prompt entirely. Saves tokens, removes unused field. Keep the column nullable for historical rows.

**(b)** Map subtype strings → strength tags via a small lookup table; bump models whose `strengths` array contains the matching tag.

I'd suggest **(a)** — subtype was nice in theory but never wired to scoring, and the strings are inconsistent ("creative_fiction" vs "creative writing"). Document the choice in code.

### Task 7.3: Calibrate `confidence` or remove

Currently every prompt scores 0.85 / 0.92 / 0.95 — the field is decorative. Pick one:

**(a)** Drop confidence; use only the boolean `clarification_needed`.

**(b)** Add 4 explicit calibration anchors to the prompt:
- 0.95+ : description specifies task verb, domain, and an output format
- 0.80–0.94 : task verb + domain clear, output format ambiguous
- 0.50–0.79 : task verb clear but ambiguous between 2+ task types
- < 0.50 : core verb unclear; ask

Suggest **(a)** for simplicity; clarification_needed already does the job.

### Task 7.4: Enforce `output_length` distinct from `input_length`

Already in 4.6 — verify `gen-creative` (1500-word story, short input) classifies as `input_length=short, output_length=medium` and `estimateCost` uses both.

---

## Phase 8 — Final regression + write-up

### Task 8.1: Run the full regression battery

**Step 1:** `npx tsx scripts/test-recommendations.ts --diff scripts/baselines/2026-05-05-baseline.json`. **Step 2:** Spot-check that:

- prompts 1, 3, 4, 14, 16, 17, 18, 32 (complex / reasoning) → top 3 contains at least one of `claude-opus-4.6 / claude-sonnet-4.6 / gpt-5.4 / gemini-3.1-pro / deepseek-r1`
- prompts 2, 5, 13, 22, 23 (simple) → top 3 still contains a budget tier
- prompt 30 (medical on-prem) → all top-3 models have `local_info`
- prompt 34 (realtime) → all top-3 have `speed_score >= 0.85`
- prompt 33 (high volume budget) → top-3 estimated cost ≤ $0.001 per call
- prompts 21/22/23 (chatbots) → no pipeline recommended
- prompts 26/27 (genuine multi-modal pipelines) → still pipeline-recommended

**Step 3:** Save fresh snapshot `scripts/baselines/2026-05-05-final.json`. **Step 4:** Commit.

### Task 8.2: Update HANDOFF.md and the public methodology

**Files:**
- Modify: `HANDOFF.md`
- Modify: `src/data/bearing-registry.json` → bump `meta.version` 0.6.0 → 0.7.0; add `scoring_methodology.notes` describing the new dimensions
- Modify: `src/app/about/page.tsx` (or wherever methodology is publicly described) — add the new classification fields and how they flow into scoring

**Step 1:** Write changelog entries. **Step 2:** Commit.

### Task 8.3: Open PR

```bash
git checkout -b tuning/recommendation-overhaul
git push -u origin tuning/recommendation-overhaul
gh pr create --title "tuning: recommendation overhaul (Phases 1-7)" --body "$(cat <<'EOF'
## Summary
- Widen task_fitness range so frontier models surface for complex tasks
- Priority-aware weight compression (rank-5+ factors damped 0.4×)
- Cost curve responds to cost weight; floor lifts when cost is low priority
- 6 new classification dimensions: data_sensitivity, latency_target, volume, needs_reasoning, needs_long_context, needs_multilingual, is_agentic, output_length
- Hard filters: on-prem, realtime, long-context
- Pipeline detection tightened (chatbots/refactors no longer pipelined)
- Classifier uses Anthropic structured-output (no more JSON parse crashes)

## Test plan
- [ ] `npx vitest run` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npx tsx scripts/test-recommendations.ts --diff scripts/baselines/2026-05-05-baseline.json` shows the expected shifts (see Task 8.1)
- [ ] Smoke-test the live UI for 3 prompts spanning simple / complex / on-prem
EOF
)"
```

---

## Risks and rollbacks

- **Phase 1 (registry)** is the only purely-data change — easiest to revert (single JSON commit). Do this first so we have a clean checkpoint.
- **Phase 2 (cost / weight compression)** could over-correct if `LOW_PRIORITY_DAMP=0.4` is too aggressive. The regression battery tells us. If transparency-first users now see only Anthropic, dial damp to 0.6.
- **Phase 4 (new classification fields)** changes the DB schema. Each migration is additive and nullable, so revert is safe but requires an explicit `ALTER TABLE … DROP COLUMN`.
- **Phase 6 (pipeline rule)** could under-detect genuine pipelines. Watch prompts #26/#27 specifically.
- **Phase 7.1 (structured output)** depends on Anthropic SDK feature support — if Haiku 4.5 doesn't support tool-use cleanly, fall back to a stricter regex but keep the test fixtures.

---

## What we're explicitly NOT doing

- Trained routing model (mentioned in HANDOFF) — still v1.5+ work.
- Community scoring — separate plan in `docs/plans/2026-04-13-community-scoring-design.md`.
- Adding new models to the registry. Tuning the existing 29 first.
- Re-grading sustainability / transparency / privacy scores — those are the registry maintainer's editorial call, not a tuning issue.
