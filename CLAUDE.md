# Project: bearing

AI model recommendation tool — helps people choose the right model for their task, with transparent scoring and open outcome data.

## Architecture

- `src/app/` — Next.js 15 App Router pages and server actions
- `src/app/admin/` — Admin UI for model CRUD (auth-gated via is_admin flag)
- `src/lib/` — Core logic: scoring engine, registry loader, classification, reasoning, weights, db
- `src/data/` — Static model registry JSON (bearing-registry.json) — generated from DB
- `src/prompts/` — Checked-in prompt files for Haiku (classify.md, reason.md)
- `src/db/migrations/` — SQL migration files for Neon (001-004)
- `scripts/` — Build scripts: seed-models.ts (JSON→DB), generate-registry.ts (DB→JSON)
- `docs/plans/` — Design docs and implementation plans

## Commands

- `npm run dev` — start development server
- `npm test` — run tests (vitest)
- `npm run build` — production build (runs prebuild → generate-registry)
- `npm run lint` — check for issues
- `npm run db:seed` — seed models table from registry JSON
- `npm run db:generate` — regenerate registry JSON from DB

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
- Neon `models` table is source of truth; `bearing-registry.json` is generated from DB via prebuild
- Scoring engine reads static JSON (fast, testable); models page reads from DB (fresh data)
- Models have `openrouter_id` column linking to OpenRouter API for discovery and pricing sync
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
- Admin access is gated by `is_admin` boolean on users table

## State & Progress

> Updated: 2026-04-13
> Current focus: Sprint 4 — Registry to DB + Admin UI
> Status: Code complete, awaiting migrations 003-004 against Neon + deploy

See PLAN.md for task tracking, STATE.md for system state, HANDOFF.md for session notes.

## Known Issues

- Quality scores in registry are estimates — weakest signal, will improve with outcome data
- Sustainability data is sparse for many providers
- Transparency scoring methodology may need tuning after real-world use

## Lessons Learned

Things Claude has got wrong on this project — don't repeat these:

- Plan referenced `verifySession()` which didn't exist — auth uses `getCurrentUser()` from `src/lib/auth.ts`
- `tsx` was available globally but not as a project dependency — npm scripts couldn't find it. Always install script runners as dev dependencies.

<!-- 
Keep this file concise. ~150 instructions max before Claude starts ignoring things.
If Claude already does something correctly without being told, don't add it here.
Focus on: things Claude gets wrong, patterns it can't infer, commands it needs.
-->
