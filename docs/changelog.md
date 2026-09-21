# Changelog

All notable changes to Bearing will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0-beta.3] — 2026-09-21

This release turns Ollama from a local-fit verification aid into a first-class local execution route for reviewed recommended chat models, while tightening the evidence and browser-permission boundaries around it.

### Added

- **Run locally in Ollama** — reviewed chat models that Bearing recommends locally for the current task can now run the user's prompt directly from the browser to `localhost:11434`. Prompt and response content stay on the device; Bearing records only coarse execution metrics.
- **Embedding verification** — reviewed embedding models can now be verified through Ollama's embedding endpoint instead of being excluded from local runtime checks.
- **Local-network permission guidance** — Bearing understands the browser's loopback/local-network permission state where available and declares an explicit permissions policy for local runtime access.
- **Signed local observation tickets** — recorded Ollama observations require a short-lived server-signed ticket and must correspond to a model Bearing actually recommended locally for that task.

### Changed

- **Compatible Ollama variants are accepted** — installed instruction and quantisation variants can satisfy a reviewed model mapping when family and parameter size still match; Bearing no longer requires one exact tag.
- **Conservative fit estimates no longer block verification** — users can explicitly try a reviewed model in Ollama even when Bearing predicts it is above the device's safe memory budget.
- **Ollama setup errors are clearer** — browser loopback permission, missing models, local daemon reachability and `OLLAMA_ORIGINS` setup are surfaced separately where possible.

### Evidence and privacy

- Verification probes remain fixed and separate from real task content.
- Real local runs send task text only to the user's local Ollama runtime.
- Observed runtime version, model/tag, quantisation, context, VRAM, throughput and latency remain distinct from Bearing's predicted hardware-fit evidence.

## [1.0.0-beta.2] — 2026-09-21

The local-model work now distinguishes four different questions instead of collapsing them into one label: **are the weights open, is there a reviewed local route, is the model likely to fit this device, and has it actually run successfully here?**

### Added


- **Local fit calibration in Admin → Insights** — successful Ollama verification probes are compared with Bearing's current hardware-fit estimate, including predicted fit/quant/runtime memory versus observed quant, resident VRAM, context and throughput. The view surfaces unexpected successful fits and average observed-minus-estimated VRAM so estimator changes can be evidence-led.
- **Verify local models in Ollama** — reviewed Ollama-capable recommendations can now run a small fixed verification probe against the user's own local Ollama runtime. Bearing does not auto-pull missing models and does not send the user's task text to the probe.
- **Measured local execution evidence** — successful verification probes can record Ollama version, exact runtime model/tag, quantisation, loaded context, resident VRAM, token throughput, token counts and timing breakdowns alongside the coarse hardware profile.
- **Execution purpose in public data** — dataset schema 2.1 distinguishes `verification_probe` from `task_execution`, preventing a hardware/runtime check from being mistaken for the user's real workload.
- **Observed-vs-predicted local evidence** — local hardware estimates and successful runtime observations are now deliberately separate evidence layers, so a conservative fit prediction can be checked against what actually ran rather than being treated as ground truth.

### Changed

- **Device checks now change the recommendation flow** — after a fresh hardware check or memory confirmation, Bearing switches to a device-aware view that keeps the original task ranking but shows only models likely to run on that machine. The first eligible result is labelled **Best on this device**, while its original overall rank stays visible.
- **Local capability is now device-specific in the UI** — checked devices turn generic "local-capable" badges into **Runs on this device** or **Local, not on this device**, including the conservative device budget and the smallest reviewed local memory requirement.
- **The local-model section is personalised after hardware assessment** — generic consumer/prosumer/workstation groups are replaced by **Can run on this device** and **Local models that need more memory**.
- **Local fit can now be checked against reality** — the existing conservative “Likely fits this device” estimate remains predictive; Ollama verification provides a separate observed evidence layer for comparing predicted and measured fit.

## [1.0.0-beta.1] — 2026-09-19

This release records the substantial Bearing 1.0 reorientation shipped since
0.9.0. Bearing is now primarily a **decision and evaluation layer for AI work**:
infer the job, recommend a route, run it where possible, challenge uncertainty,
and learn from outcomes.

### Added

- **Automatic bearing** — clear tasks no longer require compulsory manual factor
  sorting. Bearing infers a priority order from the structured task, asks for
  clarification only when needed, and keeps **Adjust bearing** as an explicit
  override.
- **Recommendation-shaped results** — one **Best fit** is foregrounded with
  meaningful trade-off alternatives selected for useful differences rather than
  simply displaying ranks two and three.
- **Recommendation confidence** — a separate evidence-strength signal now uses
  classifier confidence, top-candidate separation, catalogue freshness,
  benchmark disagreement and supported human outcome evidence. It is explicitly
  not presented as an answer-correctness probability.
- **Run any ranked model** — any recommendation can be run directly from Bearing
  with supported PDF/CSV attachments, while preserving that model's original
  recommendation rank.
- **Information-seeking Trio** — Trio keeps the selected anchor and chooses
  alternatives for information value, including provider diversity, cost/profile
  trade-offs, local versus hosted execution, sparse human evidence and benchmark
  uncertainty. A blind judge verdict and human preference remain separate
  signals.
- **Contextual Challenger** — Challenger reuses an existing successful answer
  and asks an informative alternative model to identify material gaps and
  improve it, rather than behaving as another generic pre-run comparison mode.
- **Outcome evidence** — explicit success/failure feedback, direct comparison
  preferences, Trio preferences and Challenger preferences are aggregated as
  structured human evidence. Outcome support can affect displayed confidence but
  does not yet rewrite production ranking.
- **Catalogue freshness** — provider/OpenRouter verification, freshness status,
  reviewed field-level drift and admin review/recovery controls are now
  first-class operational evidence.
- **Runtime routability canaries** — daily production observations record healthy,
  degraded and unavailable endpoints separately from intrinsic model quality.
  Conservative blocking logic requires repeated, recent explicit unavailability;
  the evidence remains observational in production while it accumulates.
- **Golden ranking corpus and shadow evaluation** — deterministic ranking
  regressions are checked in CI and candidate ranking changes can be compared
  against the approved baseline before rollout.
- **Live classifier evaluation** — a versioned semantic evaluation harness
  measures checked-field accuracy, task-type accuracy, clarification behaviour,
  pipeline detection and provider/call failures against the production
  classifier.
- **First production classifier baseline** — the 16 September run covered 28
  cases, 26 completed calls and 362 checked fields, with 80.7% field accuracy,
  83.3% task-type accuracy and 96.2% clarification accuracy. The results are
  treated as review evidence, not an automatic release threshold.
- **Optional account continuity** — signed-in tasks can be owned and shown under
  **My bearings** while anonymous recommendation use remains supported. Raw task
  descriptions are still not retained to provide continuity.
- **Inspectable learned preferences** — explicit and learned bearing preferences
  are separate, can be inspected, disabled and reset, and cannot override hard
  requirements for the current task.
- **Open-model result filtering** — results can now be filtered to models with
  strong open-weight evidence without conflating open weights with fully open
  training data, methodology or licensing.
- **Reviewed local-model evidence** — local capability now requires concrete
  quantisation/runtime evidence rather than merely downloadable weights.
  Hugging Face and Ollama catalogue adapters, an observational open-model audit
  and opt-in execution probes support the evidence workflow.
- **Reviewed open/local provenance registry** — the original 14 open-weight
  catalogue gaps were reviewed and classified as confirmed-local, hosted-only,
  provider-only or weights-available. Eight confirmed-local models were
  backfilled with concrete execution footprints.
- **Hardware-aware local recommendations** — users can opt in to a lightweight
  browser-side device check and confirm memory. Bearing stores the profile only
  in that browser by default, applies conservative runtime headroom and offers a
  **Likely fits this device** filter. WebGPU API limits are never presented as
  detected VRAM, and the SwarmLLM-style allocate-until-failure probe is not run
  by default.
- **Public dataset 2.0** — the recommendation dataset now exposes the full
  current task classification (including sensitivity, latency, volume,
  long-context, multilingual, agentic and output-length dimensions), open/local
  metadata for recommendations, selection-time model snapshots, privacy-safe
  choice context and a distinct structure for observed execution evidence.
- **Choice-context logging** — new selections can record whether Open models
  only, Runs locally or Likely fits this device filters were active, plus a
  coarse confirmed hardware profile and the predicted quant/fit. Detailed GPU
  model strings, browser user agents and IP addresses are not part of the open
  data model.
- **Execution-observation contract** — actual execution evidence is now modelled
  separately from predicted fit, ready to record local/runtime evidence such as
  Ollama runtime, quant, context length, coarse hardware, measured VRAM,
  tokens/sec and latency when a run really occurs.
- **Routed-run dataset improvements** — the public Route/Trio/Challenger export
  now includes the current task dimensions plus candidate open-weight,
  local-capability and model-class metadata, and explicitly records those runs as
  Bearing-hosted execution.
- **Comparison dataset improvements** — head-to-head exports now include current
  open/local/model-class metadata for both candidates and document the v0.9 task
  schema.
- **Public data documentation** — the Data page and live MkDocs site now document
  recommendation → choice → execution → outcome as distinct evidence layers,
  including the historical-vs-snapshot provenance rules.
- **Carbon-grounded sustainability evidence** — covered hosted models can ground
  inference-energy scores in EcoLogits observations with provenance, underlying
  carbon estimates and snapshot dates, plus scheduled refresh.
- **Admin benchmark re-fetch and smarter aliases** — live benchmark sources can
  be refreshed from the admin interface, confident aliases can be applied
  automatically, and uncertain matches surface ranked suggestions for review.
- **Much broader transparency grounding** — provider profiles and family-specific
  rules now cover a substantially wider open-model landscape, including open
  families from otherwise closed providers.

### Changed

- **Ranking scores are no longer shown as match percentages** across the main
  recommendation, validation, embedding and local-fit surfaces. Weighted scores
  remain inspectable ranking machinery, not fake probabilities.
- **Required capabilities are hard gates; optional capabilities are
  task-relative** — unrelated feature breadth no longer earns generic bonus
  points.
- **Benchmark disagreement is evidence, not something to hide** — disagreement
  between curated and benchmark signals now contributes uncertainty.
  Benchmark influence can be tapered by evidence breadth/recency; production
  still defaults to curated-first ranking with `BENCHMARK_BLEND=0`.
- **Sustainability scoring uses a fixed efficiency scale** so a model's carbon
  score does not change merely because another model enters or leaves the
  comparison cohort.
- **Embedding work uses the normal Bearing flow** — the classifier can route
  embedding tasks directly; model-class hard gating prevents chat and embedding
  models from being compared as though they were the same workload.
- **Authentication moved to email + password** with password setup/reset for
  existing accounts, replacing the previous magic-link-only flow.
- **Registry expanded to 61 active models** by 19 September 2026, with chat and
  embedding models sharing the same evidence and decision architecture.
- **Scoring/execution share one persisted-task mapping** so recommendations,
  validation and Route/Trio/Challenger do not silently interpret task
  constraints differently.
- **Public-data provenance is explicit** — current-at-export catalogue metadata,
  selection-time snapshots, historical backfills and observed execution are
  labelled separately rather than being collapsed into one ambiguous field.
- **Hardware logging is intentionally coarse** — platform, architecture, memory
  amount, GPU vendor and optional VRAM/runtime can be retained when relevant;
  detailed browser/device fingerprinting data is deliberately excluded.
- **Live documentation is now part of CI** via strict MkDocs build validation.

### Fixed

- **Qwen3.6 Plus no longer inherits an open-weight label from Alibaba's provider
  default**. Reviewed evidence identifies it as a provider-hosted product, and
  Plus / Max / Flash / Turbo family grounding now prevents the error returning
  on future imports.
- **Pipeline classifier responses get one schema-repair attempt** when structured
  output exists but violates the canonical runtime contract. Network/API
  failures remain single-attempt.
- **Single Route runs preserve original recommendation rank** instead of
  recording every chosen model as route rank #1.
- **Auto-routing can reach the genuinely top-ranked runnable models** rather than
  a small hard-coded subset.
- **PDF attachments work reliably** across Run, Trio, Challenger and Compare.
- **OpenRouter/provider mappings expanded** so many models that appeared in
  recommendations can now actually be executed.
- **Open-weight import language and licence grounding are internally
  consistent**, including open families from closed providers and provider-name
  normalisation.
- **Sustainability composites are recomputed when grounded sub-scores change**
  instead of leaving a stale headline score.
- **Admin surfaces tolerate migration rollout safely** rather than crashing when
  a newer schema has not yet reached production.

### Removed

- **Standalone Embedding tab** — embedding requests now route through the normal
  task flow.
- **Magic-link-only authentication** — replaced by the email/password flow.
- **Legacy `src/app/actions.ts` monolith** — active operations now live in
  capability-specific feature modules.
- **Legacy `src/lib/db.ts` monolith** — persistence is split into explicit
  repositories under `src/db/` for tasks, models, users, recommendations,
  feedback, runs, evidence and operations.

### Architecture and operations

The 1.0 codebase now centres on feature-owned operations under `src/features/`
and aggregate-specific persistence under `src/db/`. CI runs typecheck, lint,
tests, the golden ranking evaluation, production build and strict documentation
build before implementation PRs are merged.

Production freshness automation currently includes:

- daily runtime routability canary;
- weekly catalogue verification;
- weekly EcoLogits refresh.

Operational availability remains a separate evidence layer from intrinsic
capability and quality.

## [0.9.0] — 2026-05-29

### Added

- **Embedding models as a first-class category** — Bearing now recommends embedding models for vector-producing tasks. Ten embedding models added to the registry: OpenAI text-embedding-3-large and -small, Voyage 3 Large and Lite, Cohere Embed v4, Mistral Embed 2, GreenPT Green Embedding, BGE-M3, Nomic-embed-v2-MoE, and GTE-Qwen2-7B. Open-weight models include local deployment guidance.
- **MTEB benchmark ingest** — embedding model quality is grounded in MTEB Overall averages (Muennighoff et al. 2023). Scores are normalised within the embedding-model cohort and blended with curated values via the existing `BENCHMARK_BLEND` environment variable.
- **`/embedding` entry point** — a dedicated "Find an embedding model" form on the home page. Fields: use case, input size, hosting preference (hosted / open weights), languages, and latency requirement. No LLM classification needed — the form maps directly to a scored recommendation.
- **Model class routing** — a new `model_class` field (`"chat"` | `"embedding"`) on every registry entry hard-filters models to the correct workload. Embedding tasks never see chat models; chat tasks never see embedding models. The rejection reason `wrong_class` appears on the results page for mismatches.
- **Embedding-aware pipeline stage cards** — when a pipeline stage has `task_type = "embedding"`, the stage card shows the embedding model's dimension, Matryoshka badge, max input, and pricing as "$X.XX / 1M tokens" or "Free (self-host)".
- **Model detail page adapts for embedding models** — pricing section shows input-only billing; a new "Embedding specs" section surfaces dim / max input / Matryoshka support; Task Fitness collapses to a single MTEB quality bar.
- **`model_class` in public dataset** — every entry in `models_recommended` and `local_recommendations` now carries a `model_class` field. Dataset schema version 1.3 → 1.4.

### Changed

- **`classification_schema_version`** for new tasks bumped to `v0.9`. Adds `embedding` as the 13th canonical task type. Backward-compatible superset of v0.8.
- **Home page** gains an "Embedding" tab alongside Recommend, Pipeline, and Validate.
- Registry version bumped 0.8.0 → 0.9.0; 41 active models (31 chat + 10 embedding).

## [0.8.0] — 2026-05-06

### Added

- **12 canonical task types** — the classifier now distinguishes between twelve types of task (summarise, extract, generate, comms, code, math, reasoning, analyse, research, Q&A, translate, conversation). More precise classification means better-matched recommendations, especially for tasks that previously fell into a catch-all bucket.
- **Pipeline capability warnings** — if a pipeline stage requires a capability (e.g. vision or tool use) that the recommended model doesn't support, Bearing now shows a warning on the stage card rather than silently falling back. You'll know exactly which stage has a coverage gap.
- **Per-stage detail in pipelines** — each pipeline stage now carries its own input/output length estimate and reasoning flag, so the per-stage cost estimate is more accurate and the stage model selection reflects the actual workload of that step.
- **Local inference recommendations in the public dataset** — the open-weight models Bearing would suggest for local hardware are now included in the dataset download per task, with quant, VRAM, and hardware tier details.
- **Artificial Analysis as a third benchmark source** — Bearing now ingests per-model evaluations (intelligence, coding, math indices, plus MMLU-Pro, GPQA, HLE, LiveCodeBench, SciCode, IFBench, Tau2, TerminalBench, AIME, LCR), output throughput, and time-to-first-token from [Artificial Analysis](https://artificialanalysis.ai). 513 models covered; existing LMArena and LiveBench coverage continues unchanged.
- **Benchmark matches panel in admin import** — when importing a model from OpenRouter, Bearing shows ranked candidate variants per source (LMArena, LiveBench, Artificial Analysis) and lets you confirm which represent the model. Reasoning / non-reasoning / effort variants can all map to a single registry slug; their scores are averaged at recommendation time.
- **Refresh from benchmarks button** on every model's edit page — recomputes grounded fields from the latest benchmark snapshots and provider profile without rerunning Haiku.
- **Provenance indicators on every score slider** — a small coloured dot tells you where each value came from: green for direct benchmark, amber for deterministic provider lookup, grey for Haiku estimate.
- **Long-context capability** is now auto-set for any model with a context window of 128K tokens or more.
- **Code capability is now derived from benchmark evidence** — added or removed automatically based on whether the grounded code task fitness clears 0.5.

### Changed

- **Imported model scores are now grounded in real benchmark data, not Haiku guesses.** Task fitness for any task with benchmark coverage is computed deterministically from the confirmed source variants. Speed score comes from Artificial Analysis throughput. Privacy score, transparency open weights, and a baseline transparency score now come from a per-provider lookup table rather than Haiku, eliminating cases where an open-weight model like DeepSeek was mistakenly marked as closed.
- **Provider names with parenthetical suffixes are now normalised** (e.g. "Alibaba (via hosted providers)" → "Alibaba"), so Qwen models get the correct open-weights status.
- **Flagship-no-coverage warning** — a coral banner appears in the import modal when a flagship-priced model has zero benchmark coverage in any source. These are the cases where Haiku-only estimates do the most damage.
- **How We Rate Models** documentation expanded to cover benchmark data sources, alias matching, grounded scoring, and the provider profile lookup.

### Fixed

- The `code` capability is no longer guessed by Haiku for general-purpose models; it now reflects the grounded benchmark evidence.
- DeepSeek, Qwen, Kimi, and Granite imports no longer default to closed-weight transparency settings.
- Comparison model selections now persist across the sign-in redirect, so you no longer lose your two chosen models when you sign in mid-flow.
- The public dataset now includes every task that reached the recommendation stage, not just tasks where the user made a final model selection. Earlier tasks with no selection were previously absent.

## [0.7.0] — 2026-04-15

### Added

- **Model ratings research page** — a new documentation page at [How We Rate Models](model-ratings.md) documents the research, sources, and decisions behind every model rating in the registry. Includes provider sustainability research, capability decisions, task fitness benchmarks, and transparency methodology — all with linked sources.

### Changed

- **DeepSeek V3.2 no longer listed as a vision model** — research confirmed it does not have native vision support. Vision is expected in DeepSeek V4.
- **GreenPT GreenL now supports vision** — powered by Mistral Small 3.2, which has native image understanding. GreenPT also offers OCR and web scraper APIs.
- **GreenPT GreenR now supports extended thinking** — GPT-OSS 120B has chain-of-thought reasoning with adjustable effort.
- **Kimi K2.5 now listed with video capability** — strong video understanding confirmed by benchmarks (VideoMMMU 86.6%).
- **Google sustainability scores raised** — now reflects their 100% renewable energy match since 2017 and published per-query energy data.
- **xAI Grok sustainability score lowered** — research revealed Memphis data centre running on gas turbines without emission permits. Now scored 0.15, among the lowest in the registry.
- **GreenPT sustainability data enriched** — added PUE and WUE metrics showing 96% better water efficiency than industry average.
- **MiniMax M2.7 scores significantly improved** — SWE-bench Verified 78% justifies a code fitness score of 0.86, up from 0.78. Pricing corrected to $0.30/$1.20 (was incorrectly listed at $1.00/$4.00).
- **Multiple models received task fitness updates** based on benchmark evidence — Llama 4 Maverick, Kimi K2.5, Gemini 3 Flash, Gemini 3.1 Pro, Qwen 3.5, and IBM Granite all had scores adjusted upward with cited sources.
- **All sustainability scores now strictly follow the documented formula** — composite score equals the mean of available sub-dimensions, with no editorial adjustments.
- **Registry version updated to 0.5.0** with 29 models across 12 providers.

## [0.6.0] — 2026-04-13

### Added

- **Pipeline recommendations** — when your task involves multiple steps (like extracting text from a PDF then summarising it), Bearing now suggests a pipeline of specialist models. Each stage gets its own recommendation with an alternative, plus a cost comparison against using a single model for everything.
- **File attachments in Compare mode** — you can now attach a PDF or CSV file (up to 5MB) when comparing two models. Vision-capable models receive the raw document; text-only models get the extracted text. A "Vision" badge on model cards shows which models can process files directly.
- **Admin dashboard** — the admin panel now has Usage and Insights tabs alongside the model list. Usage shows activity over time, mode breakdown, and user signups with daily/weekly/monthly granularity. Insights shows task type distribution, a model leaderboard, outcome breakdown, and capability demand.
- **Model discovery from OpenRouter** — a new Discover tab in the admin panel shows AI models available on OpenRouter that aren't yet in the Bearing registry. Import a model with one click — Claude Haiku estimates initial scores based on the model's specs, which you can review and adjust before activating.
- **Pricing sync** — a one-click button in the admin panel updates pricing for all models from OpenRouter's latest data.

### Changed

- **Fairer cost scoring** — expensive models like Claude Opus no longer receive a flat zero on cost. The scoring now uses a logarithmic scale with a floor, so premium models can still be recommended when cost isn't a priority.
- **More accurate model scores** — recalibrated task fitness scores for seven models that were rated too generously (Qwen 3 235B, Qwen 3.5, Kimi K2/K2.5, DeepSeek V3.2, MiniMax M2.5/M2.7), based on independent benchmark data.
- **Compare mode works with all models** — previously limited to a hardcoded list. Now any model in the registry with an OpenRouter connection can be used in head-to-head comparisons, including newly imported models.

### Fixed

- **Compare page crash** — fixed an infinite render loop that occurred when loading the Compare page.
- **Mistral OCR pricing** — corrected from incorrect per-token pricing to an equivalent of its actual $2 per 1,000 pages rate.

## [0.5.0] — 2026-04-13

### Added

- **Admin panel** — authorised administrators can now add, edit, and deactivate models directly from the browser at `/admin`. The edit form includes structured controls for all model data: pricing, capabilities, task fitness scores, transparency and sustainability ratings, and strengths/weaknesses.

### Changed

- **Model registry is now database-backed** — the model registry has moved from a static file to a Neon Postgres database. This means model updates (new models, pricing changes, score adjustments) can be made through the admin panel and take effect immediately on the Models page. The recommendation engine continues to use a static snapshot for speed and reliability.
- **Models page shows live data** — the Models page now pulls directly from the database, so newly added or updated models appear without waiting for a new deployment.

## [0.4.0] — 2026-04-12

### Added

- **Compare mode** — sign in with your email and run head-to-head comparisons between two models. Same prompt, both models, real outputs side by side. Vote on which you prefer. Limited to 2 per day.
- **Magic link sign-in** — email-only authentication with no password. Needed for Compare mode only.
- **Public dataset downloads** — anonymised recommendation and comparison data available as JSON and CSV from the Data page.
- **Validate mode** — already using a model? Enter its name and describe your task to find out if it's the best fit, if you're overpaying, or if better options exist.
- **Model search and filtering** — search by name or provider, filter by provider or capability (vision, code, tools, etc.) on the Models page.
- **Persistent feedback links** — after selecting a model, get a bookmarkable link to give feedback later.

### Changed

- **Model registry expanded to 29 models** across 12 providers. Added Mistral OCR, Codestral, Devstral, Kimi K2, Kimi K2.5, Qwen 3 235B, Qwen 3.5 397B, MiniMax M2.5, MiniMax M2.7, DeepSeek V3.1, DeepSeek V3.2, DeepSeek R1 0528, and Grok 4.
- **Improved text contrast** on results cards for better readability.
- **Scoring uses 7 factors** including transparency (referencing Stanford FMTI 2025) and expanded sustainability sub-dimensions.

### Fixed

- Clarification page no longer gets stuck — replaced fragile auto-submit with an explicit Continue button.
- Database connection is now lazy, preventing build-time errors with placeholder environment variables.

## [0.1.0] — 2026-04-12

### Added

- **Recommend mode** — describe your task, answer clarifying questions, rank your priorities, get a ranked shortlist of AI models with transparent per-factor scoring.
- **7-factor scoring engine** — quality, capability, cost, speed, privacy, sustainability, transparency. Pure function, fully tested.
- **Task classification** — Claude Haiku classifies your task description into structured attributes. Asks follow-up questions when confidence is low.
- **Plain-English reasoning** — each model gets a one-sentence explanation of why it ranked where it did.
- **Priority ranking** — drag-to-reorder interface for 7 factors. Your ranking directly weights the scoring function.
- **Model registry** — browsable grid and detail pages for every model in the registry.
- **Outcome feedback** — thumbs up/down with failure reason options after trying a model.
- **About page** — what Bearing is, how data is used, open source notice.
- **Nautical editorial design** — Fraunces, DM Sans, and JetBrains Mono typography with a navy, cream, teal, coral, and amber palette from The Good Ship brand.
