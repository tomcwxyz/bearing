# Plan

> Last updated: 2026-04-13
> Status: In progress — Sprint 4

## Objective

Build Bearing — an AI model recommendation tool that helps people choose the right model for their task. Collects structured outcome data published as an open dataset.

## Approach

Server-first Next.js 15 App Router. Pure scoring function against a static JSON registry (29 models, 7 factors). Claude Haiku for task classification and reasoning. Neon Postgres for persistence. Vercel for hosting.

Design doc: `docs/plans/2026-04-12-bearing-design.md`
Implementation plan: `docs/plans/2026-04-12-bearing-sprint1.md`

## Sprint 1: Core Recommend Flow

- [x] Task 1: Project scaffold (Next.js 16, Tailwind v4, deps)
- [x] Task 2: Registry types and loader
- [x] Task 3: Priority weight conversion
- [x] Task 4: Scoring engine (7-factor, pure function)
- [x] Task 5: Database schema and connection
- [x] Task 6: Classification module (Haiku)
- [x] Task 7: Reasoning module (Haiku)
- [x] Task 8: Server actions
- [x] Task 9: Home page — task input
- [x] Task 10: Clarification page
- [x] Task 11: Priority ranking page
- [x] Task 12: Results page
- [x] Task 13: Feedback page
- [x] Task 14: Models registry page
- [x] Task 15: About page
- [x] Task 16: End-to-end smoke test
- [~] Task 17: Deploy to Vercel (needs Neon migration + Vercel link)
- [x] Task 18: Update project files

Mark tasks with:
- `[ ]` not started
- `[~]` in progress ← add "CURRENT" marker
- `[x]` complete
- `[!]` blocked — note why

## Sprint 2: Validate + Feedback Loop

- [x] Visual design system (Fraunces/DM Sans/JetBrains Mono, navy/cream/teal palette)
- [x] Restyle all pages with brand design
- [x] Validate mode (model autocomplete, 3-state assessment)
- [x] Persistent feedback URLs (bookmarkable link after selection)
- [x] Home page Validate tab wired up
- [x] `/models` polish and filtering (search, provider/capability filter pills)
- [x] Open source repo polish (README, LICENSE, CONTRIBUTING)

## Sprint 3: Compare + Public Dataset

- [x] Magic link auth (Resend, signed tokens, 15min expiry, 30-day session)
- [x] Compare mode (OpenRouter dual calls, model pair selection, side-by-side display)
- [x] Rate limiting (2 comparisons/day per user)
- [x] Content filter on prompts (Haiku + 2000 token cap)
- [x] Preference capture (model_a / model_b / tie + reason)
- [x] Public dataset export (CSV + JSON, /api/dataset and /api/dataset/comparisons)
- [x] `/data` page (methodology, schema, download links)

## Sprint 4: Registry to DB + Admin UI

- [x] Task 1: Models table migration (003-models-table.sql)
- [x] Task 2: Seed script (JSON → DB)
- [x] Task 3: Generate-registry script (DB → JSON) with prebuild hook
- [x] Task 4: Model CRUD functions in db.ts with tests
- [x] Task 5: Admin flag migration (004-admin-flag.sql)
- [x] Task 6: Admin server actions (auth-gated CRUD)
- [x] Task 7: Admin model list page
- [x] Task 8: Admin model edit/create page (structured forms)
- [x] Task 9: Wire models page to DB with JSON fallback
- [x] Task 10: Run migrations, seed, and verify
- [x] Task 11: Graceful prebuild without DB
- [x] Task 12: Update project files
- [x] Task 13: Admin dashboard — Usage tab (Recharts, activity over time, mode breakdown, signups)
- [x] Task 14: Admin dashboard — Insights tab (task types, model leaderboard, outcomes, capabilities)
- [x] Task 15: OpenRouter model discovery — Discover tab with import modal
- [x] Task 16: AI-estimated scoring via Haiku for imported models
- [x] Task 17: Pricing sync from OpenRouter
- [x] Task 18: openrouter_id column + backfill for 25 models

### Not in Sprint 4 (deferred)

- [ ] First dataset analysis + blog post
- [ ] Scoring function review against outcome data
- [ ] v1.5 training requirements doc

## Sprint 5+ (future, not planned)

- [ ] External pricing API integration (OpenRouter / provider APIs) — auto-update pricing from live sources, overlay our own fitness/transparency scores
- [ ] Community model submission queue with review workflow
- [ ] Automatic model registry from provider API discovery
- [ ] Trained routing model (v1.5 — after sufficient data)
- [ ] Embeddable widget / web component
- [ ] API endpoint for programmatic recommendations
- [ ] Organisation-level dashboards

## Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Server-first architecture | Single mental model, secure API keys, natural DB access. Edge/client alternatives rejected as over-engineering | 2026-04-12 |
| Registry v0.2.0 is authoritative | 7 factors (adds transparency), expanded sub-dimensions for sustainability. Supersedes the 6-factor spec | 2026-04-12 |
| No ORM — raw SQL with Neon serverless | Schema is straightforward, avoids Prisma/Drizzle dependency | 2026-04-12 |
| No auth library — hand-rolled magic link | Single auth flow (magic link for Compare), NextAuth is overkill | 2026-04-12 |
| OpenRouter as single gateway | One API key, one SDK for Compare mode across all providers | 2026-04-12 |
| Resend for transactional email | Free tier, simple API, good Next.js integration | 2026-04-12 |
| Hybrid DB + cached JSON for registry | DB is source of truth, build step generates static JSON for scoring. Keeps scoring fast/testable while enabling admin UI | 2026-04-13 |
| External pricing API deferred to Sprint 5+ | OpenRouter/provider API integration for auto-pricing. Not needed while registry is small enough to maintain manually | 2026-04-12 |

## Open Questions

- [ ] Exact confidence threshold tuning for classification (starting at 0.6)

## Out of Scope (current)

- OpenRouter / LiteLLM integration for direct model access from results
