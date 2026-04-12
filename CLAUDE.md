# Project: bearing

AI model recommendation tool — helps people choose the right model for their task, with transparent scoring and open outcome data.

## Architecture

- `src/app/` — Next.js 15 App Router pages and server actions
- `src/lib/` — Core logic: scoring engine, registry loader, classification, reasoning, weights, db
- `src/data/` — Static model registry JSON (bearing-registry.json)
- `src/prompts/` — Checked-in prompt files for Haiku (classify.md, reason.md)
- `src/db/migrations/` — SQL migration files for Neon
- `docs/plans/` — Design docs and implementation plans

## Commands

- `npm run dev` — start development server
- `npm test` — run tests (vitest)
- `npm run build` — production build
- `npm run lint` — check for issues

## Stack

- Next.js 15 (App Router), TypeScript, Tailwind CSS
- Neon Postgres (serverless driver, raw SQL)
- Claude Haiku (classification + reasoning via @anthropic-ai/sdk)
- OpenRouter (Compare mode gateway — Sprint 3)
- Vercel (hosting)
- Resend (magic link emails — Sprint 3)

## Standards

- Server-first: all logic in server actions, thin frontend
- Scoring engine is a pure function in `lib/scoring.ts` — no side effects, fully testable
- Registry JSON is the source of truth for model data (7 factors, 17 models)
- No raw task descriptions or prompts stored — SHA-256 hashes only
- Prompts are checked-in markdown files in `src/prompts/`, not buried in code
- No ORM — raw SQL with @neondatabase/serverless
- TDD for core logic (scoring, weights, registry)

## Verification

- Run `npm test` after changes to scoring, weights, or registry code
- Run `npm run build` after structural changes
- Run `npm run lint` before considering any task complete
- Smoke test the full recommend flow after UI changes

## Working Rules

- Always check for existing patterns before creating new ones
- Prefer small, incremental changes over big rewrites
- If a task will take more than ~50 lines of changes, use plan mode first
- Don't add dependencies without asking
- Don't refactor code that wasn't part of the task
- Don't create files without explaining what and why
- Registry v0.2.0 is authoritative for scoring factors (7 factors, not 6)

## State & Progress

> Updated: 2026-04-12
> Current focus: Sprint 1 — Core Recommend flow
> Status: Plan complete, implementation not started

See PLAN.md for task tracking, STATE.md for system state, HANDOFF.md for session notes.

## Known Issues

- Quality scores in registry are estimates — weakest signal, will improve with outcome data
- Sustainability data is sparse for many providers
- Transparency scoring methodology may need tuning after real-world use

## Lessons Learned

Things Claude has got wrong on this project — don't repeat these:

- [Add mistakes as they happen — this is the highest-leverage section]

<!-- 
Keep this file concise. ~150 instructions max before Claude starts ignoring things.
If Claude already does something correctly without being told, don't add it here.
Focus on: things Claude gets wrong, patterns it can't infer, commands it needs.
-->
