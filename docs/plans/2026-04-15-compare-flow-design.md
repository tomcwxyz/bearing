# Compare Flow Improvements Design

> Date: 2026-04-15
> Status: Approved

## Problem

1. Users who reach compare via recommendations lose their task context after sign-in — the redirect param isn't threaded through the magic link flow
2. No way to compare models directly without going through the full recommend flow first

## Fix 1: Preserve redirect through sign-in

The plumbing exists (`sendMagicLink` accepts `redirect`, verify route reads it) but the signin page doesn't thread it through.

- Signin page reads `?redirect=` from URL params
- Passes it to `requestMagicLink`
- `requestMagicLink` passes it to `sendMagicLink`
- Magic link email includes redirect → user lands back where they were

Files: `src/app/auth/signin/page.tsx`, `src/app/actions.ts`

## Fix 2: Direct compare flow

Replace the current `/compare` landing page with a full direct-compare experience.

**Flow:**
1. User visits `/compare` — sees all models in a searchable grid, picks any two
2. Types prompt, optionally attaches file
3. Clicks "Compare" → if not signed in, inline sign-in shown (email field, not a page redirect)
4. Selections + prompt preserved in sessionStorage across auth
5. After sign-in, returns to `/compare` with state restored, comparison runs
6. Results page works as-is

**Models:** Listed alphabetically with provider name. Search/filter by name. No scoring or task classification needed.

**Task record:** Create a minimal task record with `mode: 'compare_direct'` for the DB foreign key. No classification, no priority order — just enough to satisfy the `comparisons.task_id` reference.

**Files:**
- Rewrite: `src/app/compare/page.tsx` — full direct compare UI
- Modify: `src/app/actions.ts` — add `createDirectCompareTask` action
- Reuse: existing `startComparison`, `runComparison`, results page
