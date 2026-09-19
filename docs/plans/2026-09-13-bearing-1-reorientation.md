# Bearing 1.0 — reorientation roadmap

**Status:** core 1.0 product architecture substantially complete; remaining work is calibration, operational evidence and methodology truth  
**Started:** 2026-09-13  
**Last reviewed:** 2026-09-19  
**Theme:** Infer → recommend → run → challenge → learn

## Product direction

Bearing is a decision and evaluation layer for AI work, not primarily a model-scoring website.

> Tell Bearing what you are trying to do. Bearing takes a bearing, recommends the right route, lets you run it, tests uncertainty when useful, and learns from what actually worked.

The default journey is:

1. **Describe the job.**
2. **Clarify only when necessary.**
3. **Take a bearing automatically.**
4. **Recommend one route, with meaningful alternatives.**
5. **Run the real task where possible.**
6. **Challenge uncertainty when useful.**
7. **Learn from human preference and outcomes.**

Advanced users can inspect and adjust priorities, evidence, exclusions and methodology. The machinery should support the decision rather than become the interface.

## Product principles

1. **Recommendation before configuration.** A useful default judgement should not require manual factor sorting.
2. **A bearing is a reasoned route, not a percentage.** Weighted scores are ranking machinery, not calibrated probabilities.
3. **Execution closes the loop.** A recommendation is more useful when Bearing can test it on the real task.
4. **Uncertainty should trigger an experiment.** Trio and Challenger should teach us something rather than merely offer more buttons.
5. **Freshness is part of correctness.** Availability, price, capability and endpoint data change continuously.
6. **Outcome evidence should gradually replace editorial assumptions.** Curated scores bootstrap the system; they are not the final authority.
7. **Privacy remains structural.** Learning should use structured task attributes and hashes rather than retaining raw prompts by default.
8. **Operational evidence is not capability evidence.** A provider outage or missing endpoint must never become a claim that a model is intrinsically poor.
9. **One decision engine.** Recommendation, validation, execution and future API/library surfaces should reuse the same task-to-scoring logic.

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
- Task-based Compare shows relative recommendation rank rather than a pseudo-probability.
- Factor scores remain inspectable as ranking evidence, explicitly labelled as non-probabilistic.

## P0.3 Freshness as first-class data — substantially complete

Model freshness includes catalogue verification and separate runtime routability observations.

Live capabilities include provider/OpenRouter catalogue verification, reviewed field-level catalogue drift, admin freshness reporting, manual maintenance/recovery controls, daily runtime canaries and weekly catalogue/EcoLogits maintenance.

### Production routability baseline

The first authenticated production runtime canary completed successfully on **2026-09-16 at 08:35:19 UTC**:

- 42 persisted observations;
- 40 healthy;
- 0 degraded;
- 2 unavailable (`devstral`, `grok-4`), both explicit OpenRouter HTTP 404s and both first observations.

The production cron is **05:00 UTC daily**. `CRON_SECRET` is configured and verified end-to-end.

A conservative routing guard exists and is tested:

- status must be explicit `unavailable`;
- at least two consecutive failures are required;
- evidence must be recent within 24 hours;
- degraded, stale, malformed, future-dated or single observations do not block.

Routability remains **observational in production** while repeated unattended evidence is collected. Operational state remains separate from capability/quality scoring.

See `docs/operations/2026-09-16-routability-baseline.md`.

## P0.4 CI as a merge gate — workflow complete, repository enforcement pending

CI runs:

- typecheck;
- lint;
- tests;
- golden ranking evaluation;
- production build.

Implementation PRs are merged only after the full gate is green.

Repository branch protection still needs to require CI technically rather than relying on convention. The current GitHub integration cannot administer branch protection.

## P0.5 Documentation truth — current refresh complete

The live MkDocs documentation now reflects:

- automatic bearing;
- no match percentages;
- meaningful alternatives;
- current Run, Trio and Challenger behaviour;
- confidence versus ranking score;
- freshness and routability;
- benchmark rollout caution;
- live classifier evaluation;
- current feature/repository architecture.

A dedicated `How Bearing works` page exposes the architecture and evidence model publicly rather than leaving it only in the internal roadmap.

Remaining documentation work is ongoing maintenance rather than a known large truth gap.

---

# P1 — make the recommendation more useful than the ranking

## P1.1 Recommendation-shaped results — complete

The results surface prioritises **Best fit**, meaningful trade-off alternatives, concise reasoning, inspectable factor/evidence detail and **Run it** as the main next action.

Alternatives are selected for useful differences rather than simply ranks two and three.

## P1.2 Task-relative capability scoring — complete

- Required capabilities are hard gates.
- Relevant optional capabilities receive limited contextual value.
- Unrelated capability breadth is neutral.

## P1.3 Benchmark disagreement — complete for current architecture

- Curated/benchmark disagreement is explicit uncertainty rather than a hidden discard rule.
- Evidence breadth and recency taper benchmark influence when blending is enabled.
- `BENCHMARK_BLEND` remains opt-in and defaults to curated-only production ranking.
- Large ranking changes can be evaluated through shadow ranking before rollout.

## P1.4 Outcome-calibrated recommendations — evidence layer live

Human evidence aggregates explicit recommendation outcomes, pairwise comparisons, Trio preferences and Challenger preferences. Blind-judge results remain separate from human preference.

Outcome support can affect displayed recommendation confidence but does **not** yet alter ranking. Ranking integration should wait for adequate support and calibration evidence.

---

# P1 — experimentation and learning

## P1.5 Information-seeking Trio — complete

Trio keeps the chosen recommendation anchor and selects alternatives for information value, including provider diversity, cost/profile trade-offs, local versus hosted execution, sparse human outcome evidence and benchmark uncertainty.

Selection rationale and original recommendation rank are persisted separately.

## P1.6 Contextual Challenger — complete

Challenger is offered after a successful answer rather than as an equal pre-run mode. It reuses the existing answer and selects an informative alternative to critique material gaps and attempt an improvement.

## P1.7 Route metadata — complete

A single Route run records the selected model's **original recommendation rank**. Running recommendation #3 is no longer persisted as route rank #1.

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

## P1.10 Feature action architecture — complete

The legacy `src/app/actions.ts` monolith has been removed completely.

The active product is organised by capability under:

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

Recommendation results, validation, embeddings, Route/Trio/Challenger, comparisons, feedback and authentication all use feature-owned boundaries. The former monolith was deleted only after CI proved there were no remaining typed callers.

## P1.11 Database access by aggregate — complete for the current application

The legacy `src/lib/db.ts` monolith has been removed completely.

Persistence now lives in explicit repository modules under `src/db/`, including:

- tasks;
- models/catalogue;
- users/auth-related access;
- comparisons;
- feedback/selections/outcomes;
- recommendations and local recommendations;
- routed runs;
- catalogue verification and drift;
- routability;
- model/provider mappings;
- routed-selection rationale;
- outcome evidence;
- preference settings;
- benchmark evidence.

The deletion was used as a dependency test: all public product paths, scripts and the admin surface were migrated before the full CI gate passed with `src/lib/db.ts` absent.

## P1.12 Runtime classifier validation — complete

Classifier output is validated against the canonical runtime shape before it becomes application state. TypeScript types and runtime expectations no longer silently diverge.

The classifier also has one validation-triggered repair attempt for malformed structured output. The strict runtime validator remains authoritative.

---

# P2 — evaluation system

## P2.1 Golden task corpus and live classifier evaluation — first baseline captured

The versioned golden corpus covers ranking and task-shape regressions. CI uses it as a deterministic guard.

A non-blocking live semantic classifier evaluation harness is implemented through:

```bash
npm run eval:classifier
```

It reuses the production classifier and synthetic golden task descriptions plus focused ambiguity and multi-stage pipeline probes.

It reports:

- overall checked-field accuracy;
- task-type accuracy;
- clarification accuracy;
- pipeline-detection accuracy;
- provider/call failures separately;
- average classifier-reported confidence separately from measured accuracy.

### First production baseline — 16 September 2026

The first protected production run covered 28 cases:

- 26 completed;
- 2 failed structured calls;
- 362 checked fields;
- 292 passed fields;
- field accuracy: **80.7%**;
- task-type accuracy: **83.3%**;
- clarification accuracy: **96.2%**;
- average model-reported confidence: **0.84**.

The two pipeline failures were isolated with a focused production diagnostic:

- `pipeline-invoices-to-report` passed with a three-stage pipeline;
- `pipeline-research-to-comms` failed because the model returned an invalid non-canonical top-level `task_type`.

The classifier was then tightened with an explicit rule that pipeline tasks must still return one canonical top-level task type describing the final user-facing deliverable, plus one schema-repair retry only when validation fails.

The baseline is **evidence for review, not a release threshold**. Field mismatches need case-by-case inspection because some may indicate a questionable golden expectation rather than a classifier defect.

### Next classifier work

- retain repeated production baselines;
- add useful latency/cost visibility where it improves diagnosis;
- review disagreement by field and task family;
- only define gating thresholds after repeated evidence shows a metric is stable and meaningful.

## P2.2 Shadow ranking evaluation — complete

Candidate ranking changes can be replayed against the approved baseline and report changed top picks/severity before rollout.

## P2.3 Recommendation confidence — complete for current evidence sources

Confidence incorporates classification confidence, top-two separation, catalogue freshness, curated/benchmark disagreement and supported human outcome evidence.

Confidence describes evidence strength, not answer correctness probability.

---

# P2 — freshness automation

## P2.4 Provider/catalogue adapters — substantially complete

Implemented sources include OpenRouter, OpenAI, Anthropic, Google and Mistral.

Provider-primary evidence is preferred for canonical model status/capability where available; OpenRouter remains useful for routing availability.

Add direct-provider adapters when they materially improve coverage rather than simply increasing connector count.

## P2.5 Scheduled verification — live

Current operating cadence:

- **daily 05:00 UTC:** runtime routability canary;
- **weekly 04:00 UTC Monday:** catalogue verification;
- **weekly 03:00 UTC Monday:** EcoLogits refresh.

`CRON_SECRET` is configured in production and the routability job has successfully authenticated and persisted observations.

### Before enabling hard routability suppression

- confirm multiple unattended production runs;
- investigate repeated explicit 404s against current endpoint/catalogue evidence;
- only suppress recent, repeated `unavailable` observations;
- never suppress from `degraded` observations;
- restore eligibility automatically after a healthy canary;
- keep runtime state out of capability/quality scoring.

---

# P2 — open and local model evidence

## P2.6 Open/local execution evidence — implementation started

Bearing now treats openness, local feasibility and hosted availability as separate evidence layers rather than a single model label.

The first implementation slice adds:

- a strong open-weight threshold helper without claiming full open-source status;
- separate open-model and local-capable result filters;
- open/local metadata on scored recommendation objects;
- qualitative local task-fit language instead of another pseudo-probability;
- a hardware-profile contract plus deterministic memory-budget fit helper;
- Hugging Face model/provider catalogue adapters;
- Ollama Cloud and local catalogue adapters;
- an observational `npm run audit:open-models` command;
- an opt-in `npm run eval:open-models` execution probe for Ollama Cloud or Hugging Face.

Current production registry evidence on 2026-09-19 shows 30 strongly open-weight models, but only 16 of those have local execution metadata. The next step is evidence backfill and reviewed model/source mappings, not automatic ranking influence.

See `docs/plans/2026-09-19-open-local-models.md`.

---

# P3 — Bearing as a reusable decision layer

The application architecture is now ready for this to become a real next-phase design task.

The goal is to expose the same decision engine through an API/library so another product can call something like:

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

This must reuse the same services as the web application rather than create a second recommendation implementation.

Before freezing that contract, the web product and evidence model need enough operational/calibration evidence to show which fields are genuinely stable.

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
- [ ] decide when/if routability should become a live execution filter.

## 1.0-alpha.3 — challenge and learn — complete

- [x] recommendation confidence;
- [x] contextual Challenger;
- [x] information-seeking Trio;
- [x] structured human outcome aggregates;
- [x] outcome evidence in recommendation confidence;
- [x] benchmark disagreement as uncertainty;
- [x] evidence-weighted benchmark blend path behind rollout ceiling.

## 1.0-beta — continuity, architecture and calibration — substantially complete

- [x] optional task ownership;
- [x] My bearings;
- [x] inspectable learned preferences;
- [x] production ownership/preference schema;
- [x] golden corpus;
- [x] shadow ranking evaluation;
- [x] outcome evidence displayed;
- [x] feature action boundaries extracted;
- [x] legacy `src/app/actions.ts` deleted;
- [x] database access split by aggregate;
- [x] legacy `src/lib/db.ts` deleted;
- [x] non-blocking live semantic classifier evaluation harness;
- [x] first protected production classifier baseline captured;
- [x] pipeline classifier failure isolated and structured-output repair added;
- [x] live documentation refreshed to current product truth;
- [ ] collect and review repeated classifier evidence;
- [ ] collect repeated unattended routability evidence;
- [ ] decide whether evidence justifies non-zero `BENCHMARK_BLEND` in production;
- [ ] decide whether evidence justifies live routability filtering;
- [ ] require CI through branch protection when permissions allow.

---

# Immediate next work

1. **Observe routability; do not rush the gate.** Confirm unattended 05:00 UTC canaries and inspect whether repeated unavailable models remain genuine provider/mapping failures or recover.
2. **Collect repeated classifier evidence.** Retain production baselines, inspect disagreement by case, and avoid inventing thresholds from one run.
3. **Review benchmark rollout evidence.** Keep `BENCHMARK_BLEND` at zero until shadow/live evidence supports a change.
4. **Decide when operational evidence is strong enough to affect execution.** If routability becomes a live filter, keep the existing conservative repeated-failure/recovery policy.
5. **Backfill open/local evidence.** Review Hugging Face and Ollama mappings, fill the 14 strongly open-weight models currently missing local metadata, and retain provenance/freshness rather than hand-copying opaque values.
6. **Run the first open-model execution probes.** Use Ollama Cloud and/or Hugging Face on a small versioned task set, keeping routability/latency evidence observational until repeated runs justify policy changes.
7. **Prepare the reusable decision-layer contract.** Include openness and execution constraints before freezing a stable transport-independent `takeBearing` interface.
8. **Require CI in branch protection** when repository permissions allow it.
9. **Keep the live docs current as product behaviour changes.** Documentation truth is now part of the release discipline rather than a catch-up task.
