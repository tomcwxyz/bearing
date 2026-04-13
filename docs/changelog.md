# Changelog

All notable changes to Bearing will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
