# Bearing 1.0 — reorientation roadmap

**Status:** 1.0-alpha.3 complete; beta continuity/calibration foundations substantially landed  
**Started:** 2026-09-13  
**Last reviewed:** 2026-09-14  
**Theme:** Infer → recommend → run → challenge → learn

## Why this exists

Bearing started as a model recommendation tool: describe a task, rank seven factors, inspect a list of models, then choose one.

The product has grown beyond that shape. It can now classify work, enforce capability constraints, rank chat and embedding models, recommend pipelines and local models, execute a prompt, compare candidates, run Trio and Challenger experiments, record preferences, and publish outcome data.

The current interface still exposes some of the machinery as if Bearing were primarily a scoring website. Bearing 1.0 should instead behave like a decision and evaluation layer:

> Tell Bearing what you are trying to do. Bearing takes a bearing, recommends the right route, lets you run it, tests uncertainty when useful, and learns from what actually worked.

The aim is not to hide methodology. It is to move methodology behind the decision rather than making the user operate it.

## Product principles

1. **Recommendation before configuration.** Bearing should make a useful judgement from the task it has already classified. Adjustment is available, but not mandatory.
2. **A bearing is a reasoned route, not a percentage.** Prefer plain-language evidence and trade-offs over false precision.
3. **Execution closes the loop.** A recommendation that cannot be run or tested is weaker than one Bearing can validate on the user's real task.
4. **Uncertainty should trigger an experiment.** Trio and Challenger should increasingly be used to learn where the ranking is uncertain, not simply as extra buttons.
5. **Freshness is part of correctness.** Model availability, pricing, capabilities and deprecations change too quickly for freshness to be an occasional admin task.
6. **Outcome data should gradually replace editorial assumptions.** Curated scores are bootstrapping data, not the final authority.
7. **Privacy remains structural.** Raw task descriptions and prompts should not become the price of personalisation or learning.

## Target journey

### Default path

1. **Describe the job** — “What are you trying to do?”
2. **Clarify only when necessary** — one or two short rounds when classification confidence is genuinely low.
3. **Take a bearing automatically** — infer which factors matter from complexity, sensitivity, volume, latency and required capabilities.
4. **Recommend one route** — one primary recommendation with concise reasoning and meaningful alternatives.
5. **Run it** — execute the real prompt where possible.
6. **Challenge when useful** — compare alternatives when the decision is close or evidence is weak.
7. **Learn** — capture human preference/outcome and feed it back into future calibration.

### Advanced path

An **Adjust bearing** control exposes the existing seven-factor prioritisation for people who want to override Bearing's judgement. Methodology, factor values, exclusions, benchmark evidence and provenance remain inspectable from the result.

## P0 — trust and default decision flow

### P0.1 Automatic bearing

**Goal:** remove mandatory factor sorting from the normal flow.

- Add a pure policy function that derives a complete priority order from the structured classification.
- Seed the task with that priority order on initial classification.
- Recalculate it after clarification.
- Route confident tasks straight to `/results`.
- Keep `/priorities` as an explicit adjustment surface.
- Explain the top inferred priorities on the results page.

Initial policy:

- quality and capability lead for complex / reasoning-heavy work;
- privacy rises for PII or regulated data;
- cost rises with volume and batch workloads;
- speed rises for realtime work;
- transparency and sustainability remain represented without dominating unless explicitly selected by the user;
- on-prem requirements remain hard filters rather than merely a preference.

**Acceptance criteria**

- A normal confident task reaches recommendations without a compulsory priority screen.
- Every task still has all seven factors in a deterministic order.
- The user can open Adjust bearing, change the order/exclusions, and return to updated results.
- Unit tests cover the main classification → priority behaviours.

**Status:** complete.

### P0.2 Stop presenting weighted score as a calibrated match percentage

**Goal:** remove false precision.

- Replace “93% match” style language with rank / recommendation labels.
- Keep the weighted score available in methodology/debug views if useful.
- Collapse detailed seven-factor bars behind “Why this?” or an equivalent disclosure.
- Make the first recommendation visually dominant; show two or three meaningful alternatives before “show all”.

**Status:** complete.

### P0.3 Model freshness as first-class data

**Goal:** make staleness visible and enforceable.

Add model-level fields:

- `last_verified_at`
- `verification_status`: `unknown | current | attention | unavailable`
- `verification_source`
- `verification_note`

Then:

- expose freshness in admin;
- add helpers for age/status and stale thresholds;
- make discovery/import update verification metadata;
- create scheduled catalogue checks for providers/OpenRouter;
- flag active models that are stale or unavailable;
- later prevent clearly unavailable models from being routed.

Initial freshness target: active hosted models should be re-verified at least weekly; curated metadata should show its age even when it does not block ranking.

**Status:** schema, provider/OpenRouter verification, freshness evidence, reviewed drift and admin reporting are live. Runtime routability has its own observation table and admin surface. Hard suppression remains deliberately deferred until there is a trustworthy production baseline.

### P0.4 CI as a merge gate

Add GitHub Actions for:

- typecheck (`tsc --noEmit`)
- lint
- tests
- golden ranking evaluation
- production build

Do not rely on a successful Vercel deployment as the only repository-level check.

> Implemented as a repository CI workflow. Branch protection still needs to require the check before this is a literal merge gate.

### P0.5 Documentation truth

- Update README counts/auth/flow from the live implementation rather than old milestone copy.
- Add an explicit “data freshness” section to the methodology.
- Avoid hard-coded model counts in prose where the generated registry can provide them.
- Keep deployment requirements such as `CRON_SECRET` aligned with the scheduled jobs that depend on them.

**Status:** deployment example now documents `CRON_SECRET` as required for production scheduled maintenance. The wider README/methodology freshness and hard-coded-count cleanup remains.

## P1 — make the recommendation more useful than the ranking

### P1.1 Recommendation-shaped results

Move from repeated full scorecards to:

- **Best fit** — one clear recommendation and why.
- **Trade-off alternatives** — e.g. cheaper, faster, local/private, more transparent, lower-carbon when genuinely distinct.
- **Why this?** — factor evidence, hard filters, benchmark provenance and uncertainty.
- **Run it** as the primary action.

Alternative selection should be based on useful differences, not merely ranks 2–5.

**Status:** complete. Recommendation-shaped presentation is live and alternatives are selected for meaningful trade-offs rather than simply exposing ranks 2/3.

### P1.2 Task-relative capability scoring

Current capability scoring rewards the number of capabilities a model has after required capability gates pass. Replace that with task-relative scoring:

- required capabilities are hard gates;
- useful-but-not-required capabilities can add small contextual value;
- unrelated capabilities (e.g. audio for a text-only task) should not improve the score.

**Status:** implemented 2026-09-13. Required capabilities stay as hard filters; optional reasoning, multilingual, long-context and agentic capabilities provide limited task-relative headroom; unrelated capability breadth is neutral.

### P1.3 Revisit benchmark disagreement handling

The old large-delta guard protected curated specialist scores from noisy or mismatched benchmark data, but could discard external evidence precisely when it disagreed most.

Replace the binary “discard if delta > threshold” rule with evidence confidence:

- mapping/coverage confidence;
- benchmark relevance to task type;
- sample size / source breadth / recency where available;
- curated evidence confidence;
- outcome evidence from Bearing.

Disagreement should surface uncertainty and can trigger an experiment rather than silently returning to the editorial score.

**Status:** complete for the current ranking architecture. Benchmark/curated disagreement now contributes explicit uncertainty and experiment value. When benchmark blending is enabled, ranking influence is tapered by evidence breadth/recency rather than discarded by a large-delta cliff. `BENCHMARK_BLEND` remains an opt-in rollout ceiling and defaults to curated-only production ranking until live shadow evidence supports enabling it.

### P1.4 Outcome-calibrated recommendations

Build task-feature × model outcome aggregates from:

- selection outcomes;
- pairwise comparisons;
- Trio preferences;
- Challenger preferences;
- blind judge outcomes (kept separate from human preference).

Do not use raw prompts. Use the structured task attributes already stored.

First use outcome data as a displayed confidence/evidence layer. Only later blend it into ranking once there is enough support.

**Status:** implemented as an evidence layer in 1.0-alpha.3. Human outcomes/preferences are aggregated separately from blind-judge evidence, with task-type + complexity cohorts where support allows and broader task-type fallback while sparse. Supported contradiction can lower recommendation confidence, but outcome data does not yet alter ranking.

## P1 — experimentation and learning

### P1.5 Information-seeking Trio

Evolve Trio into challenger selection designed to learn:

- close score, different provider;
- frontier vs cheaper model;
- hosted vs local when relevant;
- high curated-vs-benchmark disagreement;
- low evidence / high uncertainty;
- model pairs with insufficient real outcome data.

Record why each challenger was selected.

**Status:** complete. Trio preserves the recommendation anchor, then chooses credible alternatives for information value across provider, cost, factor profile, local-vs-hosted, outcome-evidence scarcity and benchmark uncertainty. Original recommendation rank and selection rationale are recorded separately.

### P1.6 Challenger as a product behaviour, not a mode tab

Use Challenger contextually after an answer:

> “Want Bearing to challenge this answer with a strong alternative?”

This is easier to understand than presenting Route / Trio / Challenger as three equal configuration modes before the user has run anything.

**Status:** implemented 2026-09-13. Challenger is offered after a successful answer, selects an informative alternative, and reuses the answer already shown rather than running the primary model twice.

## P1 — account and continuity

### P1.7 Optional task ownership

Add nullable task ownership so signed-in users can:

- resume a bearing on another device;
- view their own recent bearings;
- save preference defaults;
- see how often they override Bearing.

Preserve anonymous use. Do not store raw task text to enable this.

**Status:** complete. Nullable `tasks.user_id` is live in production; new signed-in bearings attach ownership while anonymous use remains supported. Existing 712 pre-migration tasks were intentionally left anonymous. “My bearings” lists only the signed-in user's owned, persisted recommendations. Raw task descriptions remain unstored.

### P1.8 Inspectable preference profile

Learn lightweight defaults such as recurring preference for:

- local/private models;
- cost sensitivity;
- speed sensitivity;
- transparency / sustainability.

Preferences must be visible, editable and resettable. They influence the automatic bearing, never become hidden permanent rules.

**Status:** complete for the initial learning model. Preference settings are inspectable/disableable/resettable, explicit and learned defaults are separate, learning only uses authenticated human experiment choices with sufficient repeated evidence, and soft preference nudges cannot override hard/current-task signals. The production preference schema is live.

## P1 — architecture

### P1.9 Break up `src/app/actions.ts`

Split by product capability:

```text
src/features/
  bearing/
    policy.ts
    actions.ts
    service.ts
  recommendations/
    service.ts
  runs/
    actions.ts
    service.ts
  comparisons/
    actions.ts
    service.ts
  feedback/
    actions.ts
    service.ts
  auth/
    actions.ts
```

Keep server actions thin. Business logic should be callable independently from UI transport.

> In progress: contextual Trio/Challenger live under `src/features/runs/`; task submission/ownership, embedding preparation and clarification now have feature-level modules/actions rather than adding more logic to the monolith. `src/app/actions.ts` still contains recommendations, validation, comparisons, outcomes and legacy paths to extract.

### P1.10 Split database access by aggregate

Move away from one growing `db.ts` towards repositories such as:

```text
src/db/
  tasks.ts
  models.ts
  recommendations.ts
  runs.ts
  comparisons.ts
  users.ts
```

Remove direct SQL from UI/server-action modules.

> In progress: catalogue verification, routability observations, routed-selection rationale, outcome evidence, tasks and preference settings have dedicated repositories. Active clarification persistence no longer performs direct SQL in the UI/server action path. The remaining `lib/db.ts` surface should continue to be decomposed by aggregate.

### P1.11 Runtime validation for classifier output

The TypeScript interface and Anthropic tool schema must describe the same required fields. Add runtime validation and one canonical task-type/capability definition used by both the prompt and tool schema where practical.

**Status:** complete. Classifier responses are validated against the canonical runtime shape before entering the task pipeline; malformed or incomplete tool output no longer silently becomes application state.

## P2 — evaluation system

### P2.1 Golden task corpus

Create a versioned set of realistic tasks covering:

- all task types;
- simple/moderate/complex;
- capability gates;
- sensitivity classes;
- local/on-prem;
- volume/latency extremes;
- pipeline/non-pipeline boundary cases;
- embedding vs extract/research distinctions.

Evaluate:

- classification accuracy;
- clarification necessity;
- hard-filter correctness;
- recommendation stability;
- expected top-N model families;
- pipeline detection.

Prompt-string assertions remain useful regression guards, but they are not semantic classifier evaluation.

**Status:** the deterministic versioned golden task corpus is live and is used for ranking regression. Live semantic classifier evaluation (classification accuracy, clarification necessity and pipeline detection using real model calls) remains future work and should initially be non-blocking.

### P2.2 Shadow evaluation for ranking changes

Before changing production ranking weights:

- replay the structured golden corpus/current anonymised tasks;
- compare current vs candidate ranking;
- report changed top picks and why;
- require explicit acceptance for large shifts.

**Status:** complete. CI has an approved ranking baseline and shadow-evaluation command; candidate ranking changes report changed top picks and severity before rollout. The evidence-weighted benchmark work used this path before merge.

### P2.3 Recommendation confidence

Introduce confidence based on evidence rather than score magnitude, e.g.:

- top-two score separation;
- benchmark/curated agreement;
- freshness;
- outcome sample support;
- classification confidence.

Low-confidence recommendations should invite a comparison/challenge.

**Status:** implemented. Classification confidence, top-two relative separation, catalogue freshness, supported human outcome evidence and benchmark/curated disagreement are separate decision-evidence signals. Blind-judge outcomes remain separate from human support.

## P2 — freshness automation

### P2.4 Provider/catalogue adapters

Create small adapters with a shared shape:

```ts
interface CatalogueAdapter {
  source: string
  listModels(): Promise<CatalogueModel[]>
  verify(model: Model): Promise<VerificationResult>
}
```

Initial adapters:

- OpenRouter;
- OpenAI;
- Anthropic;
- Google;
- Mistral;
- direct providers used by runnable models.

Prefer provider primary sources for canonical capability/status and OpenRouter for routing availability.

**Status:** OpenRouter plus provider-primary adapters for OpenAI, Anthropic, Google and Mistral are implemented with explicit external identifiers and fail-safe semantics. Remaining direct providers can be added as needed.

### P2.5 Scheduled verification

- daily: endpoint/routability checks for models used to run prompts;
- weekly: catalogue discovery + metadata drift;
- weekly: benchmark/EcoLogits refresh where licences/APIs permit;
- admin report: stale, changed, newly discovered, unavailable.

A failed verification should not silently rewrite editorial scores. Store the observation and require approval for material metadata changes unless the field is safe to automate (availability, endpoint id, published pricing with provenance).

**Status:** the catalogue/freshness and routability schemas are live in production. Weekly catalogue verification, reviewed field-level drift acceptance, EcoLogits refresh and daily runtime canaries are implemented. The admin Maintenance surface can run all three jobs manually and inspect persisted routability observations. As of 2026-09-14, production Vercel is missing `CRON_SECRET`, so the scheduled requests correctly fail closed; configuring that environment value is the remaining operational fix before unattended verification resumes. Routability remains observational until enough production canary data exists for conservative suppression.

## P3 — Bearing as a reusable decision layer

Once the product loop is stable, expose the same decision engine through an API/library so other Good Ship tools can ask:

```ts
const bearing = await takeBearing({ task, constraints, preferences })
```

and receive:

```ts
{
  route,
  alternatives,
  confidence,
  reasoning,
  evidence,
  executable
}
```

This keeps Bearing valuable even when the end user never visits Bearing's own UI.

## Suggested release sequence

### 1.0-alpha.1 — take a bearing — complete

- [x] automatic priority policy;
- [x] skip compulsory priorities;
- [x] Adjust bearing;
- [x] remove match percentage;
- [x] simplify visible results;
- [x] CI.

### 1.0-alpha.2 — freshness — substantially complete

- [x] verification schema;
- [x] admin freshness view;
- [x] automated catalogue verification;
- [x] provider-primary verification;
- [x] reviewed catalogue-drift acceptance;
- [x] recommendation evidence freshness;
- [x] runtime routability canaries;
- [x] production migrations for routability/selection rationale;
- [x] admin maintenance/recovery surface;
- [ ] configure production `CRON_SECRET` so scheduled jobs can authenticate;
- [ ] finish README/methodology freshness reporting cleanup;
- [ ] establish a production routability baseline before making runtime state a hard routing gate.

### 1.0-alpha.3 — challenge and learn — complete

- [x] recommendation confidence layer;
- [x] contextual Challenger;
- [x] information-seeking Trio;
- [x] structured outcome aggregates and displayed evidence;
- [x] outcome support in recommendation confidence;
- [x] benchmark/curated disagreement as an uncertainty signal;
- [x] evidence-weighted benchmark blend path with opt-in rollout ceiling.

### 1.0-beta — continuity and calibration — substantially landed

- [x] optional task ownership;
- [x] inspectable learned preferences;
- [x] production ownership/preference migrations;
- [x] golden corpus + shadow ranking evaluation;
- [x] outcome evidence surfaced in recommendations;
- [ ] live semantic classifier evaluation over the golden task descriptions;
- [ ] decide whether/when real benchmark evidence is strong enough to enable non-zero `BENCHMARK_BLEND` in production.

## Current implementation checklist

- [x] Roadmap written and reoriented around infer → recommend → run → challenge → learn.
- [x] Automatic bearing policy + tests.
- [x] Confident tasks bypass compulsory priority sorting.
- [x] Adjust bearing remains available from results.
- [x] Match percentage removed from the primary results UI.
- [x] Default model list reduced and detailed factors moved behind disclosure.
- [x] Model freshness schema, helpers and scheduled catalogue verification.
- [x] Provider-primary catalogue verification.
- [x] Safe field-level catalogue drift review/accept flow.
- [x] Catalogue evidence confidence surfaced in recommendations.
- [x] Task-relative capability scoring.
- [x] Recommendation decision-confidence layer using classification, separation, freshness, benchmark disagreement and human outcome support.
- [x] CI workflow for typecheck, lint, tests, golden ranking evaluation and production build.
- [ ] Require CI through branch protection rather than convention alone.
- [x] Add runtime routability canaries and production persistence.
- [x] Add admin maintenance diagnostics/manual recovery.
- [ ] Configure production `CRON_SECRET`.
- [ ] Use routability observations as a safe routing gate only after a production baseline exists.
- [x] Select primary alternatives by meaningful trade-off rather than raw rank.
- [x] Turn Challenger into a contextual post-answer behaviour.
- [x] Make Trio select challengers for information value including benchmark uncertainty.
- [x] Build structured outcome aggregates and use them as displayed evidence.
- [x] Use evidence scarcity to make experiments more informative without changing ranking.
- [x] Replace binary benchmark-disagreement handling with evidence confidence when benchmark blending is enabled.
- [x] Add golden-task and shadow-ranking evaluation before larger scoring changes.
- [x] Add optional task ownership and My bearings.
- [x] Add inspectable learned preferences with reset/disable controls.
- [x] Move active clarification/embedding/submission paths out of the action monolith.
- [ ] Continue extracting recommendations, validation, comparisons and outcomes from `src/app/actions.ts`.
- [ ] Continue splitting `lib/db.ts` by aggregate.
- [ ] Add non-blocking live semantic classifier evaluation.
- [ ] Finish README/methodology truth cleanup.
