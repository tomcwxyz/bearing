# OpenRouter Model Discovery Design

> Date: 2026-04-13
> Status: Approved

## Goal

Add a Discover tab to the admin panel that shows OpenRouter models we don't have yet, lets the admin import them with AI-estimated scores as drafts, and syncs pricing for existing models.

## Approach

Use OpenRouter's public `/api/v1/models` endpoint as a discovery and pricing source. New models are imported one at a time with Claude Haiku estimating initial scores. Imported models start as inactive drafts until the admin reviews and activates them. Pricing sync is a manual button that updates existing models.

## Discover tab

Fourth tab in `/admin?tab=discover`. Three sections:

1. **Sync Pricing button** — updates pricing for all existing models with an `openrouter_id`. Shows summary of changes.
2. **Search/filter bar** — text search by name/provider, optional modality filter (text, vision, audio).
3. **New models table** — OpenRouter models not in our DB (matched by `openrouter_id`). Columns: name, provider, modality, context window, pricing, Import button. Sorted newest first.

Fetches OpenRouter API server-side on tab load, diffs against our models table.

## Import flow

1. Click "Import" → modal/drawer opens with OpenRouter data (name, provider, pricing, context, inferred capabilities)
2. Click "Generate estimates" → Claude Haiku estimates: tier, task fitness, speed, privacy, transparency, sustainability, strengths, weaknesses
3. Estimates appear in editable form (same layout as model edit page)
4. Click "Save as draft" → creates model with `active = false` and `openrouter_id` set
5. Return to Discover tab (model no longer in "new" list)

AI estimation prompt checked into `src/prompts/estimate-model.md`.

## Pricing sync

1. Fetch OpenRouter model list
2. Match against models where `openrouter_id IS NOT NULL`
3. Convert pricing: `price_per_token * 1_000_000` → `price_per_1m`
4. Update changed models
5. Show summary: "Updated pricing for N models. M unchanged."

## Data changes

**New column:**
```sql
ALTER TABLE models ADD COLUMN openrouter_id TEXT UNIQUE;
```

**Backfill:** Migration maps existing 29 models to OpenRouter IDs where possible.

**New prompt:** `src/prompts/estimate-model.md` — Haiku estimation prompt returning structured JSON.

## New files

- `src/db/migrations/005-openrouter-id.sql` — add column + backfill
- `src/lib/openrouter.ts` — fetch models, match against DB, pricing conversion
- `src/prompts/estimate-model.md` — Haiku estimation prompt
- `src/app/admin/discover-tab.tsx` — Discover tab UI (search, table, import modal)
- `src/app/admin/actions.ts` — new actions: fetchDiscoverData, importModel, syncPricing, estimateModelScores

## What's not included

- Automatic/scheduled discovery (manual only)
- Batch import (one at a time, curated)
- Auto-activation (all imports start as drafts)
- OpenRouter models without pricing (skip them)
