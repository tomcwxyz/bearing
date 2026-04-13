# OpenRouter Model Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Discover tab to the admin panel that imports models from OpenRouter with AI-estimated scores, and syncs pricing for existing models.

**Architecture:** Server action fetches OpenRouter `/api/v1/models`, diffs against our `models` table via `openrouter_id` column. Import flow uses Claude Haiku to estimate missing scores from model metadata. Pricing sync updates `pricing` JSONB for matched models. All behind admin auth.

**Tech Stack:** OpenRouter public API (no key needed for model list), Claude Haiku (@anthropic-ai/sdk), Neon Postgres, existing admin UI patterns.

---

### Task 1: Add openrouter_id column to models table

**Files:**
- Create: `src/db/migrations/005-openrouter-id.sql`

**Step 1: Write the migration**

```sql
ALTER TABLE models ADD COLUMN IF NOT EXISTS openrouter_id TEXT UNIQUE;
```

**Step 2: Run the migration**

```javascript
// Run via node against Neon
node -e "
require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.NEON_DATABASE_URL);
sql\`ALTER TABLE models ADD COLUMN IF NOT EXISTS openrouter_id TEXT UNIQUE\`.then(() => console.log('Done'));
"
```

**Step 3: Backfill existing models**

Run a script that sets `openrouter_id` for our 29 models. The mapping:

| Our slug | OpenRouter ID |
|----------|--------------|
| claude-opus-4.6 | anthropic/claude-opus-4.6 |
| claude-sonnet-4.6 | anthropic/claude-sonnet-4.6 |
| claude-haiku-4.5 | anthropic/claude-haiku-4.5 |
| gpt-5.4 | openai/gpt-5.4 |
| gpt-5.4-mini | openai/gpt-5.4-mini |
| gpt-5.4-nano | openai/gpt-5.4-nano |
| gemini-3.1-pro | google/gemini-3.1-pro-preview |
| gemini-3-flash | google/gemini-3-flash-preview |
| gemini-2.5-flash-lite | google/gemini-2.5-flash-lite |
| deepseek-r1 | deepseek/deepseek-r1 |
| deepseek-r1-0528 | deepseek/deepseek-r1-0528 |
| deepseek-v3.1 | deepseek/deepseek-chat-v3.1 |
| deepseek-v3.2 | deepseek/deepseek-v3.2 |
| llama-4-maverick | meta-llama/llama-4-maverick |
| mistral-medium-3 | mistralai/mistral-medium-3 |
| mistral-ocr | NULL (not on OpenRouter) |
| codestral-25.01 | mistralai/codestral-2508 |
| devstral | mistralai/devstral-small |
| kimi-k2 | moonshotai/kimi-k2 |
| kimi-k2.5 | moonshotai/kimi-k2.5 |
| qwen-2.5-72b | qwen/qwen-2.5-72b-instruct |
| qwen3-235b-a22b | qwen/qwen3-235b-a22b |
| qwen3.5-397b | qwen/qwen3.5-397b-a17b |
| minimax-m2.5 | minimax/minimax-m2.5 |
| minimax-m2.7 | minimax/minimax-m2.7 |
| grok-4 | x-ai/grok-4 |
| greenpt-greenl | NULL (not on OpenRouter) |
| greenpt-greenr | NULL (not on OpenRouter) |
| ibm-granite-3.3 | NULL (not on OpenRouter) |

Run the backfill via a node script that executes UPDATE statements for each mapping.

**Step 4: Commit**

```bash
git add src/db/migrations/005-openrouter-id.sql
git commit -m "feat: add openrouter_id column to models table with backfill"
```

---

### Task 2: OpenRouter API client

**Files:**
- Create: `src/lib/openrouter.ts`
- Create: `src/lib/__tests__/openrouter.test.ts`

**Step 1: Write the test**

Test the pricing conversion function (pure, no API call):

```typescript
// src/lib/__tests__/openrouter.test.ts
import { describe, it, expect } from 'vitest'
import { convertPricing, inferCapabilities } from '../openrouter'

describe('convertPricing', () => {
  it('converts per-token to per-1M tokens', () => {
    const result = convertPricing('0.000003', '0.000015')
    expect(result).toEqual({ input_per_1m: 3, output_per_1m: 15 })
  })

  it('handles free models', () => {
    const result = convertPricing('0', '0')
    expect(result).toEqual({ input_per_1m: 0, output_per_1m: 0 })
  })
})

describe('inferCapabilities', () => {
  it('infers vision from input modalities', () => {
    const caps = inferCapabilities(['text', 'image'], ['text'], ['tools', 'structured_outputs'])
    expect(caps).toContain('vision')
    expect(caps).toContain('tools')
    expect(caps).toContain('structured_output')
  })

  it('infers code from supported parameters', () => {
    const caps = inferCapabilities(['text'], ['text'], ['tools', 'include_reasoning'])
    expect(caps).toContain('tools')
    expect(caps).toContain('extended_thinking')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/openrouter.test.ts`

**Step 3: Write openrouter.ts**

```typescript
// src/lib/openrouter.ts

const OPENROUTER_API = 'https://openrouter.ai/api/v1/models'

export interface OpenRouterModel {
  id: string
  name: string
  description: string | null
  context_length: number
  architecture: {
    modality: string
    input_modalities: string[]
    output_modalities: string[]
  }
  pricing: {
    prompt: string
    completion: string
  }
  top_provider: {
    context_length: number
    max_completion_tokens: number | null
  }
  supported_parameters: string[]
  created: number
}

export function convertPricing(prompt: string, completion: string): { input_per_1m: number; output_per_1m: number } {
  return {
    input_per_1m: parseFloat(prompt) * 1_000_000,
    output_per_1m: parseFloat(completion) * 1_000_000,
  }
}

export function inferCapabilities(
  inputModalities: string[],
  outputModalities: string[],
  supportedParams: string[],
): string[] {
  const caps: string[] = []
  if (inputModalities.includes('image')) caps.push('vision')
  if (inputModalities.includes('audio')) caps.push('audio')
  if (outputModalities.includes('image')) caps.push('video')
  if (supportedParams.includes('tools') || supportedParams.includes('tool_choice')) caps.push('tools')
  if (supportedParams.includes('structured_outputs') || supportedParams.includes('response_format')) caps.push('structured_output')
  if (supportedParams.includes('include_reasoning') || supportedParams.includes('reasoning')) caps.push('extended_thinking')
  return caps
}

export function extractProvider(openrouterId: string): string {
  const prefix = openrouterId.split('/')[0]
  const providerMap: Record<string, string> = {
    'anthropic': 'Anthropic',
    'openai': 'OpenAI',
    'google': 'Google',
    'deepseek': 'DeepSeek',
    'meta-llama': 'Meta',
    'mistralai': 'Mistral',
    'qwen': 'Alibaba',
    'x-ai': 'xAI',
    'minimax': 'MiniMax',
    'moonshotai': 'Moonshot',
  }
  return providerMap[prefix] ?? prefix
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const res = await fetch(OPENROUTER_API)
  if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`)
  const data = await res.json()
  return data.data as OpenRouterModel[]
}
```

**Step 4: Run tests**

Run: `npm test -- src/lib/__tests__/openrouter.test.ts`
Expected: PASS

Run: `npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/lib/openrouter.ts src/lib/__tests__/openrouter.test.ts
git commit -m "feat: add OpenRouter API client with pricing conversion"
```

---

### Task 3: Model estimation prompt

**Files:**
- Create: `src/prompts/estimate-model.md`

**Step 1: Write the prompt**

The prompt tells Haiku to estimate scores for a new model based on its specs. It returns structured JSON matching our model schema.

Key considerations:
- Prompt must describe each score's meaning and range (0-1)
- Must list all task types for task_fitness
- Must describe tier options
- Include the model's name, provider, description, pricing, context window, and capabilities

**Step 2: Commit**

```bash
git add src/prompts/estimate-model.md
git commit -m "feat: add model estimation prompt for Haiku"
```

---

### Task 4: Server actions for discover, import, sync

**Files:**
- Modify: `src/app/admin/actions.ts`
- Modify: `src/lib/db.ts` (add openrouter_id to upsertModel)

**Step 1: Update db.ts upsertModel to include openrouter_id**

Add `openrouter_id?: string | null` to the upsertModel parameter type and include it in the INSERT/UPDATE.

**Step 2: Add new server actions to actions.ts**

- `fetchDiscoverData()` — fetches OpenRouter models, queries our DB for existing `openrouter_id` values, returns the diff (new models not in our DB)
- `estimateModelScores(openrouterModel: object)` — calls Haiku with the estimation prompt and model metadata, returns estimated scores
- `importModel(formData: FormData)` — creates a new model with `active = false` and `openrouter_id` set. Uses the existing `upsertModel` function.
- `syncPricing()` — fetches OpenRouter, matches by `openrouter_id`, updates pricing for changed models. Returns summary.

All gated behind `requireAdmin()`.

**Step 3: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 4: Commit**

```bash
git add src/app/admin/actions.ts src/lib/db.ts
git commit -m "feat: add discover, import, and pricing sync server actions"
```

---

### Task 5: Discover tab component

**Files:**
- Create: `src/app/admin/discover-tab.tsx`

**Step 1: Build the component**

A client component with:

1. **Sync Pricing button** at the top. Calls `syncPricing()` action, shows result summary in a toast/banner.

2. **Search bar** — filters the new models list by name/provider.

3. **New models table** — columns: Name, Provider, Modality, Context, Pricing (input/output per 1M), Import button. Sorted by `created` desc (newest first).

4. **Import modal** — when Import is clicked:
   - Shows model metadata from OpenRouter
   - "Generate Estimates" button calls `estimateModelScores()`
   - Shows loading state while Haiku estimates
   - Renders the estimates in the edit form layout (same sections as the model edit page: basic info, pricing, performance, capabilities, task fitness, transparency, sustainability, strengths/weaknesses)
   - All fields editable
   - "Save as Draft" button calls `importModel()`
   - On success, closes modal and removes model from the list

Styling: matches existing admin tabs — white cards, border-cream-dark, navy/teal palette.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add src/app/admin/discover-tab.tsx
git commit -m "feat: add Discover tab with import modal and pricing sync"
```

---

### Task 6: Wire Discover tab into admin page

**Files:**
- Modify: `src/app/admin/admin-tabs.tsx`
- Modify: `src/app/admin/page.tsx`

**Step 1: Add Discover to the tabs**

In `admin-tabs.tsx`:
- Add `{ key: 'discover', label: 'Discover' }` to the TABS array
- Import `DiscoverTab`
- Add `{activeTab === 'discover' && <DiscoverTab initialModels={discoverModels} />}` to the tab content
- Add the `discoverModels` prop to `AdminTabsProps`

In `page.tsx`:
- Import `fetchDiscoverData` or call the OpenRouter + DB diff directly
- Pass the new models list to `AdminTabs`

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Run all tests**

Run: `npm test`
Expected: All pass.

**Step 4: Commit**

```bash
git add src/app/admin/admin-tabs.tsx src/app/admin/page.tsx
git commit -m "feat: wire Discover tab into admin page"
```

---

### Task 7: Verify and smoke test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Smoke test**

- Navigate to `/admin?tab=discover` — should show list of OpenRouter models we don't have
- Search for a model — filter should work
- Click Import on a model — modal should open with metadata
- Click Generate Estimates — Haiku should return scores (takes a few seconds)
- Review estimates, edit if needed
- Click Save as Draft — model should be created, disappear from list
- Check `/admin?tab=models` — new model should appear (but inactive)
- Click Sync Pricing — should update pricing for matched models
- Check other tabs still work (Models, Usage, Insights)

**Step 3: Run lint**

Run: `npm run lint`
Expected: No new errors.

**Step 4: Run build**

Run: `npm run build`
Expected: Clean build.

**Step 5: Commit any fixes**

```bash
git commit -m "fix: polish Discover tab"
```

---

### Task 8: Update project files and docs

**Files:**
- Modify: `PLAN.md`
- Modify: `STATE.md`
- Modify: `CLAUDE.md`

**Step 1: Update project files**

- Add OpenRouter discover tasks to PLAN.md Sprint 4
- Add Discover tab to STATE.md component table
- Note `openrouter_id` column and OpenRouter integration in CLAUDE.md

**Step 2: Run docs-updater skill**

Update changelog and user guide with the new Discover/Import/Sync features.

**Step 3: Commit**

```bash
git add PLAN.md STATE.md CLAUDE.md
git commit -m "docs: update project files for OpenRouter discover feature"
```

---

## Dependency Graph

```
Task 1 (migration) ──→ Task 4 (actions)
Task 2 (API client) ──→ Task 4
Task 3 (prompt) ──→ Task 4
Task 4 ──→ Task 5 (Discover tab)
Task 5 ──→ Task 6 (wire into admin)
Task 6 ──→ Task 7 (verify)
Task 7 ──→ Task 8 (docs)
```

Tasks 1, 2, 3 can run in parallel.
