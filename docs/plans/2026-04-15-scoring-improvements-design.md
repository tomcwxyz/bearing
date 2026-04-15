# Scoring Improvements: Complexity Boost + Factor Exclusion

> Date: 2026-04-15
> Status: Approved

## Problem

Models like Claude Opus 4.6 and GPT-5.4 rank 17th-19th for complex coding tasks, even when cost is set as least important. Secondary dimensions (privacy, sustainability, transparency) collectively carry ~29% of the score, drowning out quality signal. Two issues:

1. **Complexity is ignored** — `complexity` is classified but never used in scoring. A complex task is scored identically to a simple one.
2. **No way to exclude irrelevant factors** — Users must rank all 7 factors; even the bottom ones carry 8-9% weight each.

## A) Complexity Boost

After computing weights from priority order, apply multipliers to quality and capability based on complexity, then renormalise.

| Complexity | quality multiplier | capability multiplier |
|-----------|-------------------|----------------------|
| simple    | 1.0               | 1.0                  |
| moderate  | 1.0               | 1.0                  |
| complex   | 1.5               | 1.3                  |

Uses the classifier's existing `complexity` field. No UI change.

## B) Factor Exclusion

- Each factor in the priority step gets an on/off toggle (enabled by default)
- Toggling off removes it from the ranked list
- Minimum 2 factors must remain enabled
- Excluded factors get zero weight — removed before rank-weight assignment so remaining factors get the full weight budget
- `excluded_factors` stored as text array on `tasks` table (migration 008)

## Files Changed

- `src/lib/weights.ts` — accept complexity + excluded factors
- `src/lib/scoring.ts` — pass complexity through to weights
- `src/app/recommend/[taskId]/page.tsx` — toggle UI on priority step
- `src/app/actions.ts` — pass excluded factors through the flow
- `src/db/migrations/008-excluded-factors.sql` — new column
- Tests for weight calculations with boost and exclusions
