# Plan

> Last updated: 2026-04-12
> Status: In progress — Sprint 1

## Objective

Build Bearing — an AI model recommendation tool that helps people choose the right model for their task. Collects structured outcome data published as an open dataset.

## Approach

Server-first Next.js 15 App Router. Pure scoring function against a static JSON registry (17 models, 7 factors). Claude Haiku for task classification and reasoning. Neon Postgres for persistence. Vercel for hosting.

Design doc: `docs/plans/2026-04-12-bearing-design.md`
Implementation plan: `docs/plans/2026-04-12-bearing-sprint1.md`

## Sprint 1: Core Recommend Flow

- [ ] Task 1: Project scaffold (Next.js, Tailwind, deps)
- [ ] Task 2: Registry types and loader
- [ ] Task 3: Priority weight conversion
- [ ] Task 4: Scoring engine (7-factor, pure function)
- [ ] Task 5: Database schema and connection
- [ ] Task 6: Classification module (Haiku)
- [ ] Task 7: Reasoning module (Haiku)
- [ ] Task 8: Server actions
- [ ] Task 9: Home page — task input
- [ ] Task 10: Clarification page
- [ ] Task 11: Priority ranking page
- [ ] Task 12: Results page
- [ ] Task 13: Feedback page
- [ ] Task 14: Models registry page
- [ ] Task 15: About page
- [ ] Task 16: End-to-end smoke test
- [ ] Task 17: Deploy to Vercel
- [ ] Task 18: Update project files

Mark tasks with:
- `[ ]` not started
- `[~]` in progress ← add "CURRENT" marker
- `[x]` complete
- `[!]` blocked — note why

## Sprint 2: Validate + Feedback Loop (planned, not started)

- [ ] Validate mode (model autocomplete, assessment logic)
- [ ] Outcome feedback flow (persistent URLs)
- [ ] `/models` polish and filtering
- [ ] Open source repo polish (README, LICENSE, CONTRIBUTING)

## Sprint 3: Compare + Public Dataset (planned, not started)

- [ ] Magic link auth (Resend)
- [ ] Compare mode (dual API calls via OpenRouter, side-by-side)
- [ ] Rate limiting (2/day)
- [ ] Content filter on prompts
- [ ] Public dataset export (CSV, JSON, API)
- [ ] `/data` page

## Sprint 4: Learn + Write (planned, not started)

- [ ] First dataset analysis
- [ ] Blog post
- [ ] Scoring function review against outcome data
- [ ] v1.5 training requirements doc

## Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Server-first architecture | Single mental model, secure API keys, natural DB access. Edge/client alternatives rejected as over-engineering | 2026-04-12 |
| Registry v0.2.0 is authoritative | 7 factors (adds transparency), expanded sub-dimensions for sustainability. Supersedes the 6-factor spec | 2026-04-12 |
| No ORM — raw SQL with Neon serverless | Schema is straightforward, avoids Prisma/Drizzle dependency | 2026-04-12 |
| No auth library — hand-rolled magic link | Single auth flow (magic link for Compare), NextAuth is overkill | 2026-04-12 |
| OpenRouter as single gateway | One API key, one SDK for Compare mode across all providers | 2026-04-12 |
| Resend for transactional email | Free tier, simple API, good Next.js integration | 2026-04-12 |

## Open Questions

- [ ] Brand/visual design — to be developed using impeccable/frontend-design skills
- [ ] Exact confidence threshold tuning for classification (starting at 0.6)

## Out of Scope

- Embeddable widget / web component
- API endpoint for programmatic recommendations
- Trained routing model (v1.5 — after sufficient data)
- Organisation-level dashboards
- OpenRouter / LiteLLM integration for direct model access
