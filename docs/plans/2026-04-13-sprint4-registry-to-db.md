# Sprint 4: Registry to DB Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the model registry from a static JSON file to Neon Postgres, with a build step that generates the static JSON snapshot so scoring stays fast and testable. Add an admin UI for managing models.

**Architecture:** The `models` table becomes the source of truth. A `generate-registry` script queries Neon and writes `bearing-registry.json`. The scoring engine, weights, and tests continue to consume the static JSON — zero changes needed. The models page and admin UI read from DB for freshest data. Admin access is gated by an `is_admin` flag on the users table.

**Tech Stack:** Neon Postgres (JSONB columns for nested data), Next.js server actions, existing auth system (magic link), `dotenv` for build script DB access.

---

### Task 1: Create models table migration

**Files:**
- Create: `src/db/migrations/003-models-table.sql`

**Step 1: Write the migration SQL**

```sql
CREATE TABLE IF NOT EXISTS models (
  slug              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  provider          TEXT NOT NULL,
  tier              TEXT NOT NULL,
  pricing           JSONB NOT NULL,
  context_window    INT NOT NULL,
  capabilities      TEXT[] NOT NULL DEFAULT '{}',
  strengths         TEXT[] NOT NULL DEFAULT '{}',
  weaknesses        TEXT[] NOT NULL DEFAULT '{}',
  task_fitness      JSONB NOT NULL DEFAULT '{}',
  speed_score       FLOAT NOT NULL DEFAULT 0.5,
  privacy_score     FLOAT NOT NULL DEFAULT 0.5,
  transparency      JSONB NOT NULL,
  sustainability    JSONB NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);
CREATE INDEX IF NOT EXISTS idx_models_tier ON models(tier);
CREATE INDEX IF NOT EXISTS idx_models_active ON models(active) WHERE active = true;

-- Add foreign key from recommendations to models
-- (not enforced retroactively, but documents the relationship)
COMMENT ON COLUMN recommendations.model_slug IS 'References models.slug';
COMMENT ON COLUMN selections.model_slug IS 'References models.slug';
COMMENT ON COLUMN comparisons.model_a_slug IS 'References models.slug';
COMMENT ON COLUMN comparisons.model_b_slug IS 'References models.slug';
```

Design notes:
- `slug` as TEXT PK (not UUID) — matches existing `model_slug` references throughout the app.
- `pricing`, `transparency`, `sustainability`, `task_fitness` as JSONB — mirrors the JSON structure exactly, avoids unnecessary normalization for data that's always read as a unit.
- `capabilities`, `strengths`, `weaknesses` as TEXT[] — simple, queryable with `@>` operator, no join tables needed for 29 models.
- `active` flag — soft delete for models, so historical recommendations still reference valid slugs.
- No FK constraints on existing `model_slug` columns — would break for historical data and the columns already contain valid slugs.

**Step 2: Verify migration syntax**

Run: `npm run build`
Expected: Build passes (migration isn't executed at build, just needs to be valid SQL on disk).

**Step 3: Commit**

```bash
git add src/db/migrations/003-models-table.sql
git commit -m "feat: add models table migration for registry-to-DB"
```

---

### Task 2: Seed script — load JSON into models table

**Files:**
- Create: `scripts/seed-models.ts`
- Modify: `package.json` (add seed script)

**Step 1: Write the seed script**

```typescript
// scripts/seed-models.ts
// Reads bearing-registry.json and inserts all models into the Neon models table.
// Usage: npx tsx scripts/seed-models.ts

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'
import registryData from '../src/data/bearing-registry.json'

async function seed() {
  const databaseUrl = process.env.NEON_DATABASE_URL
  if (!databaseUrl) {
    console.error('NEON_DATABASE_URL not set')
    process.exit(1)
  }

  const sql = neon(databaseUrl)
  const models = Object.entries(registryData.models)

  console.log(`Seeding ${models.length} models...`)

  for (const [slug, model] of models) {
    const m = model as any
    await sql`
      INSERT INTO models (
        slug, name, provider, tier, pricing, context_window,
        capabilities, strengths, weaknesses, task_fitness,
        speed_score, privacy_score, transparency, sustainability
      ) VALUES (
        ${slug}, ${m.name}, ${m.provider}, ${m.tier},
        ${JSON.stringify(m.pricing)}::jsonb, ${m.context_window},
        ${m.capabilities}::text[], ${m.strengths}::text[], ${m.weaknesses}::text[],
        ${JSON.stringify(m.task_fitness)}::jsonb,
        ${m.speed_score}, ${m.privacy_score},
        ${JSON.stringify(m.transparency)}::jsonb,
        ${JSON.stringify(m.sustainability)}::jsonb
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        provider = EXCLUDED.provider,
        tier = EXCLUDED.tier,
        pricing = EXCLUDED.pricing,
        context_window = EXCLUDED.context_window,
        capabilities = EXCLUDED.capabilities,
        strengths = EXCLUDED.strengths,
        weaknesses = EXCLUDED.weaknesses,
        task_fitness = EXCLUDED.task_fitness,
        speed_score = EXCLUDED.speed_score,
        privacy_score = EXCLUDED.privacy_score,
        transparency = EXCLUDED.transparency,
        sustainability = EXCLUDED.sustainability,
        updated_at = now()
    `
    console.log(`  ✓ ${slug}`)
  }

  console.log(`Done — ${models.length} models seeded.`)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
```

**Step 2: Add script to package.json**

Add to `scripts`:
```json
"db:seed": "tsx scripts/seed-models.ts"
```

**Step 3: Verify it compiles**

Run: `npx tsx --version`
Expected: Version output (tsx is already available via vitest's dependency tree, or installed globally). If not available, we'll need to install it as a dev dependency — ask first.

**Step 4: Commit**

```bash
git add scripts/seed-models.ts package.json
git commit -m "feat: add seed script to load registry JSON into models table"
```

---

### Task 3: Build script — generate registry JSON from DB

**Files:**
- Create: `scripts/generate-registry.ts`
- Modify: `package.json` (add generate script)

This is the key piece of the hybrid architecture. The scoring engine stays fast by reading static JSON, but the JSON is now generated from the DB.

**Step 1: Write the generate script**

```typescript
// scripts/generate-registry.ts
// Queries models table and writes bearing-registry.json.
// Run during build or after admin edits.
// Usage: npx tsx scripts/generate-registry.ts

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'
import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

async function generate() {
  const databaseUrl = process.env.NEON_DATABASE_URL
  if (!databaseUrl) {
    console.error('NEON_DATABASE_URL not set')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  // Fetch all active models
  const rows = await sql`
    SELECT slug, name, provider, tier, pricing, context_window,
           capabilities, strengths, weaknesses, task_fitness,
           speed_score, privacy_score, transparency, sustainability
    FROM models
    WHERE active = true
    ORDER BY slug
  `

  // Read current registry to preserve metadata sections
  const registryPath = join(__dirname, '..', 'src', 'data', 'bearing-registry.json')
  const existing = JSON.parse(readFileSync(registryPath, 'utf-8'))

  // Build models object keyed by slug
  const models: Record<string, any> = {}
  for (const row of rows) {
    const { slug, ...rest } = row
    models[slug] = {
      name: rest.name,
      provider: rest.provider,
      tier: rest.tier,
      pricing: rest.pricing,
      context_window: rest.context_window,
      capabilities: rest.capabilities,
      strengths: rest.strengths,
      weaknesses: rest.weaknesses,
      task_fitness: rest.task_fitness,
      speed_score: rest.speed_score,
      privacy_score: rest.privacy_score,
      transparency: rest.transparency,
      sustainability: rest.sustainability,
    }
  }

  const registry = {
    meta: {
      ...existing.meta,
      updated: new Date().toISOString().split('T')[0],
      notes: `Generated from database. ${Object.keys(models).length} active models.`,
    },
    scoring_methodology: existing.scoring_methodology,
    transparency_methodology: existing.transparency_methodology,
    sustainability_methodology: existing.sustainability_methodology,
    models,
  }

  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n')
  console.log(`Generated registry with ${Object.keys(models).length} models → ${registryPath}`)
}

generate().catch(err => {
  console.error('Generate failed:', err)
  process.exit(1)
})
```

**Step 2: Add scripts to package.json**

```json
"db:generate": "tsx scripts/generate-registry.ts",
"prebuild": "tsx scripts/generate-registry.ts"
```

Note: `prebuild` runs automatically before `npm run build`, so Vercel deploys always get fresh registry data. For local dev without DB access, the existing JSON file works as-is.

**Step 3: Verify existing tests still pass**

Run: `npm test`
Expected: All tests pass — the JSON file hasn't changed, scoring engine is untouched.

**Step 4: Commit**

```bash
git add scripts/generate-registry.ts package.json
git commit -m "feat: add generate-registry script (DB → static JSON)"
```

---

### Task 4: DB helper functions for model CRUD

**Files:**
- Modify: `src/lib/db.ts` (add model query functions)
- Create: `src/lib/__tests__/db-models.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/__tests__/db-models.test.ts
import { describe, it, expect, vi } from 'vitest'

// We'll test the data transformation logic, not the DB calls
// DB calls are integration-tested via the seed/generate scripts
import { modelRowToModel } from '../db'

describe('modelRowToModel', () => {
  it('converts a DB row to a Model object with slug', () => {
    const row = {
      slug: 'test-model',
      name: 'Test Model',
      provider: 'TestCo',
      tier: 'balanced',
      pricing: { input_per_1m: 1.0, output_per_1m: 2.0 },
      context_window: 128000,
      capabilities: ['vision', 'code'],
      strengths: ['Fast'],
      weaknesses: ['Expensive'],
      task_fitness: { code: 0.9, generate: 0.7 },
      speed_score: 0.8,
      privacy_score: 0.6,
      transparency: {
        open_weights: 0, open_training_data: 0, open_methodology: 0.5,
        licence_openness: 0.3, provider_disclosure: 0.7,
        fmti_company_score: null, transparency_score: 0.3, notes: ''
      },
      sustainability: {
        inference_energy: 0.5, training_footprint: null,
        provider_infrastructure: 0.6, sustainability_score: 0.55, notes: ''
      },
      active: true,
      created_at: '2026-04-13',
      updated_at: '2026-04-13',
    }
    const model = modelRowToModel(row)
    expect(model.slug).toBe('test-model')
    expect(model.name).toBe('Test Model')
    expect(model.pricing.input_per_1m).toBe(1.0)
    expect(model.capabilities).toEqual(['vision', 'code'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/db-models.test.ts`
Expected: FAIL — `modelRowToModel` doesn't exist yet.

**Step 3: Add model CRUD functions to db.ts**

Add to `src/lib/db.ts`:

```typescript
import type { Model } from './registry'

// Convert a DB row to the Model interface used by the rest of the app
export function modelRowToModel(row: any): Model {
  return {
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    tier: row.tier,
    pricing: row.pricing,
    context_window: row.context_window,
    capabilities: row.capabilities,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    task_fitness: row.task_fitness,
    speed_score: row.speed_score,
    privacy_score: row.privacy_score,
    transparency: row.transparency,
    sustainability: row.sustainability,
  }
}

export async function getAllModelsFromDb(): Promise<Model[]> {
  const rows = await sql`
    SELECT * FROM models WHERE active = true ORDER BY name
  `
  return rows.map(modelRowToModel)
}

export async function getModelFromDb(slug: string): Promise<Model | null> {
  const rows = await sql`
    SELECT * FROM models WHERE slug = ${slug}
  `
  return rows.length > 0 ? modelRowToModel(rows[0]) : null
}

export async function upsertModel(model: {
  slug: string; name: string; provider: string; tier: string;
  pricing: { input_per_1m: number; output_per_1m: number };
  context_window: number; capabilities: string[]; strengths: string[];
  weaknesses: string[]; task_fitness: Record<string, number>;
  speed_score: number; privacy_score: number;
  transparency: any; sustainability: any;
}): Promise<void> {
  await sql`
    INSERT INTO models (
      slug, name, provider, tier, pricing, context_window,
      capabilities, strengths, weaknesses, task_fitness,
      speed_score, privacy_score, transparency, sustainability
    ) VALUES (
      ${model.slug}, ${model.name}, ${model.provider}, ${model.tier},
      ${JSON.stringify(model.pricing)}::jsonb, ${model.context_window},
      ${model.capabilities}::text[], ${model.strengths}::text[], ${model.weaknesses}::text[],
      ${JSON.stringify(model.task_fitness)}::jsonb,
      ${model.speed_score}, ${model.privacy_score},
      ${JSON.stringify(model.transparency)}::jsonb,
      ${JSON.stringify(model.sustainability)}::jsonb
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, provider = EXCLUDED.provider, tier = EXCLUDED.tier,
      pricing = EXCLUDED.pricing, context_window = EXCLUDED.context_window,
      capabilities = EXCLUDED.capabilities, strengths = EXCLUDED.strengths,
      weaknesses = EXCLUDED.weaknesses, task_fitness = EXCLUDED.task_fitness,
      speed_score = EXCLUDED.speed_score, privacy_score = EXCLUDED.privacy_score,
      transparency = EXCLUDED.transparency, sustainability = EXCLUDED.sustainability,
      updated_at = now()
  `
}

export async function deactivateModel(slug: string): Promise<void> {
  await sql`UPDATE models SET active = false, updated_at = now() WHERE slug = ${slug}`
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/db-models.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `npm test`
Expected: All pass — no existing code changed.

**Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/__tests__/db-models.test.ts
git commit -m "feat: add model CRUD functions and DB-to-Model conversion"
```

---

### Task 5: Add is_admin to users table

**Files:**
- Create: `src/db/migrations/004-admin-flag.sql`

**Step 1: Write the migration**

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
```

**Step 2: Add admin check helper to db.ts**

Add to `src/lib/db.ts`:

```typescript
export async function isUserAdmin(userId: string): Promise<boolean> {
  const rows = await sql`SELECT is_admin FROM users WHERE id = ${userId}`
  return rows.length > 0 && rows[0].is_admin === true
}
```

**Step 3: Commit**

```bash
git add src/db/migrations/004-admin-flag.sql src/lib/db.ts
git commit -m "feat: add is_admin flag to users table"
```

---

### Task 6: Admin server actions

**Files:**
- Create: `src/app/admin/actions.ts`

**Step 1: Write admin server actions**

```typescript
'use server'

import { cookies } from 'next/headers'
import { verifySession } from '@/lib/auth'
import { isUserAdmin, getAllModelsFromDb, getModelFromDb, upsertModel, deactivateModel } from '@/lib/db'
import type { Model } from '@/lib/registry'

async function requireAdmin(): Promise<string> {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')
  if (!session) throw new Error('Not authenticated')
  const payload = await verifySession(session.value)
  if (!payload) throw new Error('Invalid session')
  const admin = await isUserAdmin(payload.userId)
  if (!admin) throw new Error('Not authorised')
  return payload.userId
}

export async function listModelsAdmin(): Promise<Model[]> {
  await requireAdmin()
  return getAllModelsFromDb()
}

export async function getModelAdmin(slug: string): Promise<Model | null> {
  await requireAdmin()
  return getModelFromDb(slug)
}

export async function saveModelAdmin(formData: FormData): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()

  try {
    const slug = formData.get('slug') as string
    const model = {
      slug,
      name: formData.get('name') as string,
      provider: formData.get('provider') as string,
      tier: formData.get('tier') as string,
      pricing: JSON.parse(formData.get('pricing') as string),
      context_window: parseInt(formData.get('context_window') as string, 10),
      capabilities: JSON.parse(formData.get('capabilities') as string),
      strengths: JSON.parse(formData.get('strengths') as string),
      weaknesses: JSON.parse(formData.get('weaknesses') as string),
      task_fitness: JSON.parse(formData.get('task_fitness') as string),
      speed_score: parseFloat(formData.get('speed_score') as string),
      privacy_score: parseFloat(formData.get('privacy_score') as string),
      transparency: JSON.parse(formData.get('transparency') as string),
      sustainability: JSON.parse(formData.get('sustainability') as string),
    }
    await upsertModel(model)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function deactivateModelAdmin(slug: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await deactivateModel(slug)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add src/app/admin/actions.ts
git commit -m "feat: add admin server actions for model CRUD"
```

---

### Task 7: Admin model list page

**Files:**
- Create: `src/app/admin/page.tsx`

**Step 1: Build the admin model list**

A server component that lists all models from the DB with edit/deactivate controls. Follows existing design patterns (Fraunces headings, navy/cream palette, DM Sans body text).

The page should show:
- Table of models: slug, name, provider, tier, speed_score, pricing summary
- "Edit" link per row → `/admin/models/[slug]`
- "Add Model" button → `/admin/models/new`
- Admin auth check (redirect to `/auth/signin` if not admin)

**Step 2: Verify it renders**

Run: `npm run dev`
Navigate to `http://localhost:3000/admin`
Expected: If authed as admin, shows model list. If not, redirects.

**Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: add admin model list page"
```

---

### Task 8: Admin model edit/create page

**Files:**
- Create: `src/app/admin/models/[slug]/page.tsx`

**Step 1: Build the model edit form**

A client component with a form for all model fields. For complex fields (pricing, task_fitness, transparency, sustainability), use structured sub-forms rather than raw JSON textareas.

Key sections:
1. **Basic info:** slug (read-only on edit, editable on new), name, provider, tier dropdown
2. **Pricing:** input_per_1m, output_per_1m (number inputs)
3. **Performance:** context_window, speed_score (range 0-1), privacy_score (range 0-1)
4. **Capabilities:** checkbox group for all known capabilities
5. **Task fitness:** slider per task type (0.0-1.0)
6. **Transparency:** sub-score inputs + notes textarea
7. **Sustainability:** sub-score inputs + notes textarea
8. **Strengths/weaknesses:** editable list (add/remove items)

On save, calls `saveModelAdmin` server action. Shows success/error feedback.

For `slug = "new"`, render an empty form for creating a new model.

**Step 2: Verify create flow**

Run: `npm run dev`
Navigate to `http://localhost:3000/admin/models/new`
Expected: Empty form renders, can fill in and submit.

**Step 3: Verify edit flow**

Navigate to `http://localhost:3000/admin/models/claude-sonnet-4.6`
Expected: Form pre-populated with model data.

**Step 4: Commit**

```bash
git add src/app/admin/models/
git commit -m "feat: add admin model edit/create page"
```

---

### Task 9: Wire models page to DB (with JSON fallback)

**Files:**
- Modify: `src/app/models/page.tsx`
- Modify: `src/lib/registry.ts` (add DB-aware getter)

**Step 1: Add a DB-first getter to registry.ts**

```typescript
// Try DB first, fall back to static JSON if DB unavailable
export async function getAllModelsLive(): Promise<Model[]> {
  try {
    const { getAllModelsFromDb } = await import('./db')
    return await getAllModelsFromDb()
  } catch {
    // DB unavailable (local dev, build time) — use static JSON
    return getAllModels()
  }
}
```

**Step 2: Update models page to use live data**

Change `getAllModels()` → `await getAllModelsLive()` in the models page server component. This means the `/models` page shows the freshest DB data, while the scoring engine continues using the static JSON snapshot.

**Step 3: Run tests**

Run: `npm test`
Expected: All pass — `getAllModels()` unchanged, new function is additive.

**Step 4: Verify models page**

Run: `npm run dev`
Navigate to `http://localhost:3000/models`
Expected: Same 29 models, now sourced from DB.

**Step 5: Commit**

```bash
git add src/lib/registry.ts src/app/models/page.tsx
git commit -m "feat: wire models page to DB with JSON fallback"
```

---

### Task 10: Run migration, seed, and verify

This is the operational task — run against the real Neon database.

**Step 1: Run migration 003**

```bash
# Copy the SQL and run against Neon (via psql, Neon console, or a runner script)
# The exact method depends on how migrations 001/002 were run
```

**Step 2: Run migration 004**

Same process for the admin flag migration.

**Step 3: Seed models**

```bash
npm run db:seed
```

Expected: 29 models seeded, each printed with ✓.

**Step 4: Generate registry from DB**

```bash
npm run db:generate
```

Expected: JSON written, same 29 models. Run `git diff src/data/bearing-registry.json` to verify the output is equivalent (may have minor formatting/ordering differences).

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass with the regenerated JSON.

**Step 6: Run build**

Run: `npm run build`
Expected: Clean build.

**Step 7: Set yourself as admin**

```sql
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

**Step 8: Smoke test admin UI**

- Navigate to `/admin` — should see model list
- Click Edit on any model — should see pre-populated form
- Make a trivial change (update a note), save
- Run `npm run db:generate` — verify change appears in JSON
- Revert the change

**Step 9: Commit regenerated registry**

```bash
git add src/data/bearing-registry.json
git commit -m "chore: regenerate registry JSON from database"
```

---

### Task 11: Update prebuild for Vercel

**Files:**
- Modify: `package.json`

The `prebuild` script needs to handle the case where `NEON_DATABASE_URL` is set (Vercel) vs not set (local dev without DB).

**Step 1: Make prebuild graceful**

Update the generate script to exit cleanly (not error) when `NEON_DATABASE_URL` is missing:

In `scripts/generate-registry.ts`, change the missing-URL handler:
```typescript
if (!databaseUrl) {
  console.log('NEON_DATABASE_URL not set — skipping registry generation, using existing JSON')
  process.exit(0)  // Exit clean, not error
}
```

**Step 2: Verify local build still works**

Run: `npm run build` (without NEON_DATABASE_URL)
Expected: Build passes, uses existing JSON.

**Step 3: Commit**

```bash
git add scripts/generate-registry.ts
git commit -m "fix: graceful prebuild when NEON_DATABASE_URL not set"
```

---

### Task 12: Update project files

**Files:**
- Modify: `PLAN.md`
- Modify: `STATE.md`
- Modify: `HANDOFF.md`
- Modify: `CLAUDE.md`

**Step 1: Update PLAN.md**

Mark Sprint 4 tasks as complete. Update the "Decisions Made" table with the hybrid approach decision.

**Step 2: Update STATE.md**

Update component status table — models table, admin UI, generate script. Move state to "Live" if deployed.

**Step 3: Update HANDOFF.md**

Document what was done, what's not done, any issues encountered.

**Step 4: Update CLAUDE.md**

- Update registry version reference
- Add admin UI to architecture notes
- Note hybrid DB + JSON approach

**Step 5: Commit**

```bash
git add PLAN.md STATE.md HANDOFF.md CLAUDE.md
git commit -m "docs: update project files for Sprint 4 completion"
```

---

## Dependency Graph

```
Task 1 (migration) ──→ Task 2 (seed) ──→ Task 10 (run migration + seed)
                   ──→ Task 3 (generate)─┘
Task 4 (DB helpers) ──→ Task 6 (admin actions) ──→ Task 7 (list page) ──→ Task 8 (edit page)
Task 5 (admin flag) ──→ Task 6
Task 4 ──→ Task 9 (models page wiring)
Task 3 ──→ Task 11 (prebuild)
All ──→ Task 12 (project files)
```

Tasks 1, 4, and 5 can run in parallel.
Tasks 2 and 3 can run in parallel (both depend on Task 1).
Tasks 7 and 9 can run in parallel (both depend on Task 4+6).

---

## What's intentionally NOT in this sprint

- **Blog post / dataset analysis** — content work, not engineering. Do separately.
- **Scoring function review** — needs real outcome data first; premature now.
- **Foreign key constraints on model_slug** — would require backfilling historical data, not worth the complexity.
- **Model version history** — YAGNI for now. Git history of the JSON file serves this purpose.
- **Redis/cache layer** — 29 models is tiny. DB queries are fast enough. Add caching when there's evidence of a problem.
