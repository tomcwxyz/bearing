# Bearing 1.0 — reorientation roadmap

**Status:** alpha foundations complete; beta continuity/calibration substantially landed  
**Started:** 2026-09-13  
**Last reviewed:** 2026-09-16  
**Theme:** Infer → recommend → run → challenge → learn

## Product direction

Bearing is no longer primarily a model-scoring website. It is becoming a decision and evaluation layer for AI work:

> Tell Bearing what you are trying to do. Bearing takes a bearing, recommends the right route, lets you run it, tests uncertainty when useful, and learns from what actually worked.

The default journey should be:

1. **Describe the job.**
2. **Clarify only when necessary.**
3. **Take a bearing automatically.**
4. **Recommend one route, with meaningful alternatives.**
5. **Run the real task where possible.**
6. **Challenge uncertainty when useful.**
7. **Learn from human preference and outcomes.**

Advanced users can still inspect and adjust priorities, evidence, exclusions and methodology. The machinery should support the decision rather than become the interface.

## Product principles

1. **Recommendation before configuration.** A useful default judgement should not require manual factor sorting.
2. **A bearing is a reasoned route, not a percentage.** Weighted scores are internal ranking machinery, not calibrated probabilities.
3. **Execution closes the loop.** A recommendation is more useful when Bearing can test it on the real task.
4. **Uncertainty should trigger an experiment.** Trio and Challenger should teach us something rather than simply offer more buttons.
5. **Freshness is part of correctness.** Availability, price, capability and endpoint data change continuously.
6. **Outcome evidence should gradually replace editorial assumptions.** Curated scores bootstrap the system; they are not the final authority.
7. **Privacy remains structural.** Learning should use structured task attributes and hashes rather than retaining raw prompts by default.
8. **Operational evidence is not capability evidence.** A provider outage or missing endpoint must never become a claim that a model is intrinsically poor.

---

# P0 — trust and the default decision flow

## P0.1 Automatic bearing — complete

- Classification derives a deterministic priority order.
- Confident tasks bypass compulsory priority sorting.
- Clarification updates the bearing when confidence is genuinely low.
- **Adjust bearing** remains available as an explicit override.
- Hard requirements such as on-premise execution remain gates rather than soft preferences.

## P0.2 Remove false match precision — complete

- Primary recommendations no longer present weighted score as `% match`.
- Validation and embedding results follow the same rule.
- Task-based Compare now shows relative recommendation rank rather than a pseudo-probability.
- Factor scores remain inspectable as ranking evidence, explicitly labelled as non-probabilistic.

## P0.3 Freshness as first-class data — substantially complete

Model freshness includes:

- `last_verified_at`
- `verification_status`
- `verification_source`
- `verification_note`
- runtime routability observations in `model_routability`

Live capabilities now include:

- provider/OpenRouter catalogue verification;
- reviewed field-level catalogue drift;
- admin freshness reporting;
- manual maintenance/recovery controls;
- daily runtime canaries;
- weekly catalogue and EcoLogits maintenance.

### Production routability baseline

The first authenticated production runtime canary completed successfully on **2026-09-16 at 08:35:19 UTC**:

- 42 persisted observations;
- 40 healthy;
- 0 degraded;
- 2 unavailable (`devstral`, `grok-4`), both explicit OpenRouter HTTP 404s and both first observations.

The production cron has been restored to **05:00 UTC daily**. `CRON_SECRET` is configured and verified end-to-end.

Routability remains **observational**. A routing guard now requires at least two consecutive recent explicit `unavailable` observations; degraded, stale, malformed or single observations do not qualify. The guard is not yet wired into live recommendation/execution filtering.

See `docs/operations/2026-09-16-routability-baseline.md`.

## P0.4 CI as a merge gate — workflow complete, repository enforcement pending

CI runs:

- typecheck;
- lint;
- tests;
- golden ranking evaluation;
- production build.

All recent implementation PRs are being merged only after the full job is green. Repository branch protection still needs to require CI technically rather than relying on convention.

## P0.5 Documentation truth — in progress

Completed:

- production `CRON_SECRET` requirement documented;
- first routability baseline recorded;
- this roadmap refreshed against the live architecture.

Remaining:

- README flow/auth/model-count cleanup;
- methodology freshness section;
- remove stale hard-coded counts and old monolith descriptions.

---

# P1 — make the recommendation more useful than the ranking

## P1.1 Recommendation-shaped results — complete

The results surface now prioritises:

- **Best fit**;
- meaningful trade-off alternatives;
- concise reasoning;
- inspectable factor/evidence detail;
- **Run it** as the main next action.

Alternatives are selected for useful differences rather than simply ranks 2 and 3.

## P1.2 Task-relative capability scoring — complete

- Required capabilities are hard gates.
- Relevant optional capabilities receive limited contextual value.
- Unrelated capability breadth is neutral.

## P1.3 Benchmark disagreement — complete for the current architecture

- Curated/benchmark disagreement is explicit uncertainty rather than a hidden discard rule.
- Evidence breadth and recency taper benchmark influence when blending is enabled.
- `BENCHMARK_BLEND` remains opt-in and defaults to curated-only production ranking.
- Large ranking changes can be evaluated through shadow ranking before rollout.

## P1.4 Outcome-calibrated recommendations — evidence layer live

Human evidence aggregates:

- explicit recommendation outcomes;
- pairwise comparisons;
- Trio preferences;
- Challenger preferences.

Blind-judge results remain separate from human preference.

Outcome support can affect displayed recommendation confidence but does **not** yet alter ranking. Ranking integration should wait for adequate support and calibration evidence.

---

# P1 — experimentation and learning

## P1.5 Information-seeking Trio — complete

Trio keeps the chosen recommendation anchor and selects alternatives for information value, including:

- provider diversity;
- cost/profile trade-offs;
- local versus hosted execution;
- sparse human outcome evidence;
- benchmark uncertainty.

Selection rationale and original recommendation rank are persisted separately.

## P1.6 Contextual Challenger — complete

Challenger is offered after a successful answer rather than as an equal pre-run mode. It reuses the existing answer and selects an informative alternative to critique material gaps and attempt an improvement.

## P1.7 Route metadata — complete

A single Route run now records the selected model's **original recommendation rank**. Running recommendation #3 is no longer persisted as route rank #1.

---

# P1 — account and continuity

## P1.8 Optional task ownership — complete

- Signed-in bearings can be resumed and listed in **My bearings**.
- Anonymous use remains supported.
- Existing pre-migration tasks remain anonymous.
- Raw task descriptions are not retained to enable continuity.

## P1.9 Inspectable preference profile — complete for the initial learning model

- Explicit and learned preferences are separate.
- Preferences can be inspected, disabled and reset.
- Learning uses authenticated human choices with minimum support.
- Preference nudges cannot override hard/current-task requirements.

---

# P1 — architecture

## P1.10 Break up `src/app/actions.ts` — substantially landed

The active product is now increasingly organised by capability:

```text
src/features/
  auth/
  bearing/
  comparisons/
  feedback/
  recommendations/
  runs/
  validation/
```

Completed active-path extractions include:

- task submission, ownership, clarification and embedding preparation;
- recommendation results service and canonical persisted-task scoring input;
- validation submission + results service;
- embedding results service;
- Route, Trio and Challenger execution;
- routed preference capture;
- comparison model loading, task creation, quota/ownership, execution and preference capture;
- account/password auth actions;
- recommendation selection and explicit outcome feedback.

The Run surface, direct Compare and task-based Compare now use the extracted auth feature. Task-based Compare uses the shared recommendation service rather than legacy `getResults`.

### Remaining action-monolith work

- identify and remove legacy duplicate exports once repository-wide callers are confirmed migrated;
- move any remaining active embedding/auth/comparison compatibility paths out or delete them;
- keep server actions thin and move reusable business logic into services.

The next step is **deletion and dependency verification**, not creating another parallel layer.

## P1.11 Split database access by aggregate — in progress

Dedicated repositories already cover areas including:

- tasks;
- catalogue verification;
- routability;
- routed-selection rationale;
- outcome evidence;
- preference settings.

Continue reducing `lib/db.ts` towards aggregate repositories such as models, recommendations, runs, comparisons and users. UI/server-action modules should not accumulate direct SQL.

## P1.12 Runtime classifier validation — complete

Classifier output is validated against the canonical runtime shape before it becomes application state. TypeScript types and runtime expectations no longer silently diverge.

---

# P2 — evaluation system

## P2.1 Golden task corpus — deterministic layer complete

The versioned corpus covers ranking and task-shape regressions. CI uses it as a deterministic guard.

Still needed: **live semantic classifier evaluation** using real model calls for classification accuracy, clarification necessity and pipeline detection. This should begin as non-blocking reporting.

## P2.2 Shadow ranking evaluation — complete

Candidate ranking changes can be replayed against the approved baseline and report changed top picks/severity before rollout.

## P2.3 Recommendation confidence — complete for current evidence sources

Confidence incorporates distinct signals including:

- classification confidence;
- top-two separation;
- catalogue freshness;
- curated/benchmark disagreement;
- supported human outcome evidence.

Confidence describes evidence strength, not answer correctness probability.

---

# P2 — freshness automation

## P2.4 Provider/catalogue adapters — substantially complete

Implemented sources include:

- OpenRouter;
- OpenAI;
- Anthropic;
- Google;
- Mistral.

Provider-primary evidence is preferred for canonical model status/capability where available; OpenRouter remains useful for routing availability. Add direct-provider adapters when they materially improve coverage.

## P2.5 Scheduled verification — live

Current operating cadence:

- **daily 05:00 UTC:** runtime routability canary;
- **weekly 04:00 UTC Monday:** catalogue verification;
- **weekly 03:00 UTC Monday:** EcoLogits refresh.

`CRON_SECRET` is configured in production and the routability job has successfully authenticated and persisted observations.

### Before enabling hard routability suppression

- confirm repeated unattended production runs;
- investigate repeated explicit 404s against current endpoint/catalogue evidence;
- only suppress recent, repeated `unavailable` observations;
- never suppress from `degraded` observations;
- restore eligibility automatically after a healthy canary;
- keep runtime state out of capability/quality scoring.

---

# P3 — Bearing as a reusable decision layer

Once the product loop and evidence model are stable, expose the same decision engine through an API/library so other tools can call something like:

```ts
const bearing = await takeBearing({ task, constraints, preferences })
```

and receive a transport-independent result such as:

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

This should reuse the same services as the web application rather than create a second recommendation implementation.

---

# Release state

## 1.0-alpha.1 — take a bearing — complete

- [x] automatic priority policy;
- [x] skip compulsory priorities;
- [x] Adjust bearing;
- [x] remove match percentage from recommendation surfaces;
- [x] simplify visible results;
- [x] CI workflow.

## 1.0-alpha.2 — freshness — substantially complete

- [x] verification schema;
- [x] admin freshness view;
- [x] automated catalogue verification;
- [x] provider-primary verification;
- [x] reviewed catalogue drift;
- [x] recommendation freshness evidence;
- [x] runtime routability canaries;
- [x] production routability persistence;
- [x] admin maintenance/recovery surface;
- [x] production `CRON_SECRET` configured and verified;
- [x] first production routability baseline recorded;
- [x] conservative repeated-failure guard implemented and tested;
- [ ] verify multiple unattended daily canaries;
- [ ] decide when/if routability should become a live execution filter;
- [ ] finish README/methodology freshness cleanup.

## 1.0-alpha.3 — challenge and learn — complete

- [x] recommendation confidence;
- [x] contextual Challenger;
- [x] information-seeking Trio;
- [x] structured human outcome aggregates;
- [x] outcome evidence in recommendation confidence;
- [x] benchmark disagreement as uncertainty;
- [x] evidence-weighted benchmark blend path behind rollout ceiling.

## 1.0-beta — continuity and calibration — substantially landed

- [x] optional task ownership;
- [x] My bearings;
- [x] inspectable learned preferences;
- [x] production ownership/preference schema;
- [x] golden corpus;
- [x] shadow ranking evaluation;
- [x] outcome evidence displayed;
- [x] active recommendation/run/compare/validation/feedback/auth boundaries substantially extracted from the action monolith;
- [ ] delete confirmed-dead legacy action implementations;
- [ ] continue `lib/db.ts` aggregate split;
- [ ] add non-blocking live semantic classifier evaluation;
- [ ] decide whether real benchmark evidence justifies non-zero `BENCHMARK_BLEND` in production;
- [ ] require CI through branch protection;
- [ ] finish README/methodology truth cleanup.

---

# Immediate next work

1. **Observe routability, do not rush the gate.** Confirm the next unattended 05:00 UTC canary and inspect whether `devstral` / `grok-4` repeat or recover.
2. **Delete legacy action duplication carefully.** Verify remaining `src/app/actions.ts` callers, then remove migrated implementations and unused imports in small CI-gated PRs.
3. **Continue the database split.** Start with whichever remaining `lib/db.ts` aggregate has the clearest active feature owner (likely comparisons/runs/recommendations).
4. **Refresh public documentation.** Bring README and methodology into line with the current product flow, auth model, freshness system and feature architecture.
5. **Add live classifier evaluation.** Run semantic classification checks as non-blocking evidence before considering them a merge gate.
6. **Review benchmark rollout evidence.** Keep `BENCHMARK_BLEND` at zero until shadow/live evidence supports a change.
7. **Require CI in branch protection** when repository permissions allow it.
