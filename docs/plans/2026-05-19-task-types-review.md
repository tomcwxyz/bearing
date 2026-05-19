# Task-type review

**Date:** 2026-05-19
**Status:** Approved — pending v0.7.0 merge before execution
**Owner:** Tom

## Approved decisions (2026-05-19)

1. **Remove `vision` as a task type.** It stays only as a capability (`requires_capabilities: ["vision"]`).
2. **Remove `"other"` entirely.** Classifier must pick a real type or set `clarification_needed: true` when confidence is low.
3. **Keep `is_agentic` as a separate flag** (do not introduce an `agent` task type). Add UI surfacing when `is_agentic: true` so users know the recommendation assumes a tool harness.
4. **Version bump to 0.8.0** — breaking registry schema change.
5. **Land v0.7.0 first** on a clean branch from master before starting this work.

## Why now

The current canonical task types (`summarise`, `generate`, `extract`, `code`, `analyse`, `translate`, `conversation`, `vision`, `other`) have two visible problems:

1. **`"other"` is a silent failure mode.** When the classifier picks it (e.g. for the Grafana "open a browser and analyse" prompt), downstream code reads `task_fitness["other"]` and gets `undefined`. In `local-inference.ts:111` this defaults to `0` and filters every model out — the "Run it locally" section silently disappears. In `scoring.ts:188` it defaults to `0.5` and recommendations come back generic. Both consumers swallow the failure rather than warning.

2. **The types are too few and too coarse.** Mathematical reasoning, multi-step logic puzzles, factual Q&A, and research with citations are all currently routed through `analyse`. Short business comms (email, slack reply) are routed through `generate`. The benchmark grounding work (v0.7.0) already exposes this — `livebench.reasoning`, `livebench.mathematics`, `aa_math`, `aime_25`, `gpqa`, `hle` all collapse into `analyse` in `benchmarks.ts:30-74`, so we lose meaningful signal.

A short prompt fix (Option B from the earlier discussion, already shipped) tells the classifier to pick by **intent** not **mechanism** — that stops the Grafana-style "other" misfires. This plan is the deeper Option C: a properly-scoped task-type expansion.

## Inventory of current state

### Definition

`src/lib/registry.ts:5` — single source of truth for `TaskType`. Currently nine values including `other`.

### Where `task_type` is consumed

| Site | Behaviour on unknown / "other" |
|---|---|
| `src/lib/scoring.ts:188` | `?? 0.5` — defaults silently |
| `src/lib/local-inference.ts:111` | `?? 0` — filters model out silently (this is the bug) |
| `src/lib/benchmarks.ts:30` | Reverse map (category → task) — adding a type requires updating the benchmark-source mappings |
| `src/app/actions.ts:112` | Persisted to DB row |
| `src/app/admin/discover-tab.tsx:27` | Duplicated `ALL_TASK_TYPES` literal — admins toggle fitness values |
| `src/app/admin/models/[slug]/page.tsx:12` | Duplicated `ALL_TASK_TYPES` literal — same |
| `src/app/recommend/[taskId]/results/page.tsx:39` | Displays raw string to user |
| `src/app/validate/[taskId]/results/page.tsx:177` | Displays raw string to user |
| `src/app/models/[slug]/page.tsx:190` | Iterates `task_fitness` for model detail page |
| `src/lib/db.ts:286,362,374` | Stored as JSONB; type-agnostic |

### Coverage in registry data

All 29 models in `src/data/bearing-registry.json` have **exactly** the eight task-keys (`code`, `vision`, `analyse`, `extract`, `generate`, `summarise`, `translate`, `conversation`). No `other` key present, which is what causes the silent-zero. No drift across models — they're uniform.

### Duplication risk

`ALL_TASK_TYPES` is defined twice in admin pages with no `other`. The registry data also doesn't include `other`. So `other` only exists in the classifier's enum and the `TaskType` union — everywhere it matters it's missing. This is consistent with treating it as an escape valve rather than a real type.

## Proposed type list

Twelve types, organised by what the user *wants out*. Existing types preserved where the meaning stays clean; narrowed where overloaded.

| Type | Definition | Notes / migration |
|---|---|---|
| `summarise` | Condense longer input into shorter output | unchanged |
| `extract` | Pull structured data from unstructured input (incl. OCR, transcription, table extraction) | absorbs current "extract from PDF" cases that misfire as `vision` |
| `generate` | Create new long-form prose: reports, articles, proposals, creative writing | narrowed — short business comms move to `comms` |
| `comms` | **New.** Short business communication: emails, Slack replies, customer responses, meeting recaps | currently misclassified as `generate` |
| `code` | Write, review, debug, or explain code | unchanged |
| `math` | **New.** Numerical computation, calculation, proofs, formal problem-solving | currently misclassified as `analyse` |
| `reasoning` | **New.** Multi-step logic, planning under constraints, structured decisions where the *process* matters more than the *facts* | currently misclassified as `analyse` |
| `analyse` | Interpret and explain qualitative information; produce judgments backed by evidence | narrowed — pure logic moves to `reasoning`, pure maths moves to `math` |
| `research` | **New.** Investigative Q&A that benefits from tool use, retrieval, or citing sources | currently splits between `analyse` and `conversation` |
| `qa` | **New.** Short factual question-answer: definitions, lookups, factual recall | currently misclassified as `conversation` |
| `translate` | Convert text between human languages | unchanged |
| `conversation` | Ongoing multi-turn dialogue: chatbots, tutoring, brainstorming, dialogue companions | narrowed — one-shot Q&A moves to `qa` |

### Notes on what is *not* in the list

- **`vision`** is removed as a task type. It was already overloaded (also a capability) and the use cases it covers all reduce to one of the above (vision-input extraction → `extract`; vision-input analysis → `analyse`; etc.). Image *input* is expressed via `requires_capabilities: ["vision"]`.
- **`other`** is removed. With twelve types, every reasonable request maps somewhere. If a request genuinely can't be classified, the classifier sets `clarification_needed: true` and returns `confidence < 0.5` instead of routing through a silently-broken type.

### Distinguishing rubrics (hardest cases)

These are the boundaries I expect the classifier to mis-call most often. Worth nailing down in the prompt:

- **`reasoning` vs `analyse`** — `reasoning` is process-led (the user wants the *steps*, the *logic*, the *plan*); `analyse` is interpretation-led (the user wants the *meaning*, the *judgement*, the *assessment*). Test: "Plan the optimal order to visit 6 cities given these constraints" → reasoning. "Why is our churn rate trending up?" → analyse.

- **`math` vs `reasoning`** — `math` is numeric/formal; `reasoning` is symbolic/strategic. Test: "Solve this integral" → math. "Which is the cheapest hardware plan that meets all constraints?" → reasoning.

- **`qa` vs `research`** — `qa` is short and self-contained; `research` benefits from tools or citations. Test: "What's the capital of Bulgaria?" → qa. "What's the current state of FDA approval for GLP-1 drugs?" → research.

- **`qa` vs `conversation`** — `qa` is one-shot, `conversation` is multi-turn. Test: A single factual question → qa. A back-and-forth chatbot → conversation.

- **`comms` vs `generate`** — `comms` is short and addressed to a specific audience; `generate` is long-form. Test: "Reply to this customer email apologetically" → comms. "Write a 5-page proposal for the board" → generate.

## Migration plan

### Step 1 — Data: fill in `task_fitness` for the new types

The 29 existing models have eight keys; the new schema needs four added (`comms`, `math`, `reasoning`, `research`, `qa`) and one removed (`vision`).

Three options:

**A. Derive from benchmarks** (preferred — matches v0.7.0 grounding philosophy)

- `math` ← `livebench.mathematics`, `aa_math`, `aime_25`, `math_500`
- `reasoning` ← `livebench.reasoning`, `gpqa`, `hle`, `mmlu_pro`
- `research` ← (limited direct coverage — fall back to a curated derivation, e.g. `0.6 * analyse + 0.4 * tools-capable`)
- `qa` ← `aa_intelligence` as a weak proxy; otherwise curated
- `comms` ← no direct benchmark — derive as `0.85 * generate` initially

This means updating `CATEGORY_TO_TASKS` in `src/lib/benchmarks.ts` to map benchmark categories onto the *new* types directly, then re-running the grounding job over the snapshots already in `benchmark_snapshots`.

**B. Manual curation** — fast but regresses the v0.7.0 work. Not recommended.

**C. Sensible defaults + iterate** — start every model at `0.5` for the new types and lean on benchmark grounding to refine. Safer than A as a first step but produces uniformly mediocre recommendations until grounding runs.

Recommendation: **A with C as fallback for types with no benchmark coverage** (`research`, `comms`, `qa`).

### Step 2 — Code: update the type definition and consumers

- `src/lib/registry.ts:5` — update `TaskType` union. Remove `vision` and `other`. Add `math`, `reasoning`, `research`, `qa`, `comms`.
- `src/lib/scoring.ts:188` — review the `?? 0.5` fallback. With `other` gone, missing keys would indicate a stale registry row; consider erroring loudly instead.
- `src/lib/local-inference.ts:111` — same review. The `?? 0` default *should* never fire under the new schema; consider erroring or warning.
- `src/lib/benchmarks.ts:30-74` — extensive update. Reroute math/reasoning categories away from `analyse`. Add explicit `research`/`qa`/`comms` mappings where benchmarks exist.
- `src/app/admin/discover-tab.tsx:27` and `src/app/admin/models/[slug]/page.tsx:12` — update both `ALL_TASK_TYPES` literals. **Also dedupe** — move to a shared constant exported from `registry.ts`.

### Step 3 — Prompt: rewrite `src/prompts/classify.md`

- Update the task_type enum in the schema (line 8 and line 36 — the pipeline stage variant).
- Replace the "Task type definitions" section with the rubric in this doc.
- Keep the "classify by intent, not mechanism" guidance added in Option B.
- Add the four hardest-case rubrics (math vs reasoning, qa vs research, qa vs conversation, comms vs generate) as worked examples.
- Add 4-6 new few-shot-style examples covering the new types.

### Step 4 — UI

- `recommend/[taskId]/results/page.tsx:39` and `validate/[taskId]/results/page.tsx:177` display the raw task_type string. Add a display-name map (`'qa' → 'question answering'`, `'comms' → 'business communication'`, etc.). Probably belongs in `registry.ts` alongside the type.
- `models/[slug]/page.tsx:190` displays the `task_fitness` keys — same label treatment.
- **Agentic badge.** When `is_agentic: true` on the classification, render a small notice near the top of the results page: "This task involves agent-style steps (browser automation, tool calls, code execution). The recommendation assumes your deployment provides a tool harness — e.g. Playwright/MCP for browsers, code-execution sandboxes, file I/O. Without that, the model can analyse but cannot act." This is non-blocking — the recommendation still renders — but tells the user honestly that capability ≠ execution.

### Step 5 — Tests

- `src/lib/__tests__/scoring.test.ts:160,190,211,228` — currently uses `'code'` and `'analyse'`. Add tests covering at least one each of the new types and confirming that fallbacks behave correctly.
- `src/lib/__tests__/classification.test.ts` — add a "classify by intent" test (e.g. the Grafana prompt) confirming the right type is chosen.
- Add a registry-integrity test: every model must have all twelve task-fitness keys, no extras.
- Add a benchmark-mapping test: every key in `CATEGORY_TO_TASKS` must point to a valid `TaskType`.

### Step 6 — Database

`task_fitness` is stored as JSONB so the schema doesn't need migrating, but the *contents* of existing rows need updating to match the new keys.

- Write a one-off migration script (or admin-side action) that:
  - Reads each row's current `task_fitness`.
  - Drops the `vision` key.
  - Computes new keys per Step 1.A.
  - Writes back.
- Run it once against prod after merge. Keep the previous JSONB blob in a backup column or git-tracked snapshot for rollback.

### Step 7 — Docs

- Update `docs/scoring/task-fitness-rubric.md` (if it exists; if not, create) with the new twelve-type rubric and worked examples.
- Update `docs/model-ratings.md` with the new task labels.
- Update `docs/user-guide.md` if it references task types by name.
- Update `docs/changelog.md` with a v0.8.0 entry.
- Bump `meta.version` in `bearing-registry.json` to `0.8.0`.

## Scope and ordering

This is a single coherent change. Estimated diff: 500–800 lines including data migration, code, prompt rewrite, and tests. I'd suggest a separate branch (`feat/task-types-v2`) with the work ordered:

1. Update `TaskType` + shared `ALL_TASK_TYPES` constant (compiler will tell us everywhere that breaks).
2. Update benchmarks mapping + run grounding to populate new fitness values.
3. Migrate registry JSON + DB rows.
4. Update prompt + add classifier tests.
5. Update UI labels + admin pages.
6. Update docs + bump version.
7. Manual QA against the three test prompts (and the Grafana case).

## Open questions

_All five resolved 2026-05-19 — see "Approved decisions" at the top._
