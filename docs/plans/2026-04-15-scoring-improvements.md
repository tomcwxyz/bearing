# Scoring Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make scoring respect task complexity and let users exclude irrelevant factors, so frontier models rank appropriately for hard tasks.

**Architecture:** Two changes to the weight calculation in `priorityToWeights`: (1) complexity multipliers on quality/capability after blending, (2) excluded factors zeroed before rank-weight assignment. One UI change: toggle switches on the priorities page. One new DB column for excluded_factors.

**Tech Stack:** TypeScript, Vitest, Next.js App Router, Neon Postgres, Tailwind CSS

---

### Task 1: Complexity boost in weights.ts

**Files:**
- Modify: `src/lib/weights.ts`
- Test: `src/lib/__tests__/weights.test.ts`

**Step 1: Write failing tests**

Add to `src/lib/__tests__/weights.test.ts`:

```typescript
it('applies complexity boost for complex tasks', () => {
  const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
  const normal = priorityToWeights(order)
  const boosted = priorityToWeights(order, { complexity: 'complex' })
  expect(boosted.quality).toBeGreaterThan(normal.quality)
  expect(boosted.capability).toBeGreaterThan(normal.capability)
  const sum = Object.values(boosted).reduce((a, b) => a + b, 0)
  expect(sum).toBeCloseTo(1.0, 5)
})

it('applies moderate complexity boost', () => {
  const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
  const normal = priorityToWeights(order)
  const moderate = priorityToWeights(order, { complexity: 'moderate' })
  const complex = priorityToWeights(order, { complexity: 'complex' })
  expect(moderate.quality).toBeGreaterThan(normal.quality)
  expect(complex.quality).toBeGreaterThan(moderate.quality)
})

it('no boost for simple complexity', () => {
  const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
  const normal = priorityToWeights(order)
  const simple = priorityToWeights(order, { complexity: 'simple' })
  expect(simple.quality).toBeCloseTo(normal.quality, 5)
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/weights.test.ts`
Expected: FAIL — `priorityToWeights` doesn't accept a second argument

**Step 3: Implement complexity boost**

Update `src/lib/weights.ts`:

```typescript
const COMPLEXITY_BOOST: Record<string, { quality: number; capability: number }> = {
  simple: { quality: 1.0, capability: 1.0 },
  moderate: { quality: 1.2, capability: 1.1 },
  complex: { quality: 1.5, capability: 1.3 },
}

interface WeightOptions {
  complexity?: string
  excludedFactors?: string[]
}

export function priorityToWeights(
  priorityOrder: Factor[],
  options?: WeightOptions,
): Record<Factor, number> {
  const defaults = getDefaultWeights()
  const complexity = options?.complexity ?? 'simple'
  const boost = COMPLEXITY_BOOST[complexity] ?? COMPLEXITY_BOOST.simple

  const raw: Record<string, number> = {}
  for (let i = 0; i < priorityOrder.length; i++) {
    const factor = priorityOrder[i]
    raw[factor] = RANK_BLEND * RANK_WEIGHTS[i] + (1 - RANK_BLEND) * defaults[factor]
  }

  // Apply complexity boost
  if (raw.quality) raw.quality *= boost.quality
  if (raw.capability) raw.capability *= boost.capability

  const total = Object.values(raw).reduce((a, b) => a + b, 0)
  const weights: Record<string, number> = {}
  for (const [factor, value] of Object.entries(raw)) {
    weights[factor] = value / total
  }

  return weights as Record<Factor, number>
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/weights.test.ts`
Expected: PASS (all existing + 3 new)

**Step 5: Pass complexity through scoring.ts**

In `src/lib/scoring.ts`, update line ~74:

```typescript
const weights = priorityToWeights(input.priorityOrder, { complexity: input.complexity })
```

**Step 6: Run full test suite**

Run: `npm test`
Expected: All pass

**Step 7: Commit**

```
feat: add complexity boost to scoring weights

Complex tasks amplify quality (1.5x) and capability (1.3x) weights.
Moderate tasks get a smaller boost (1.2x/1.1x). Weights renormalise
so they still sum to 1.0.
```

---

### Task 2: Factor exclusion in weights.ts

**Files:**
- Modify: `src/lib/weights.ts`
- Test: `src/lib/__tests__/weights.test.ts`

**Step 1: Write failing tests**

Add to `src/lib/__tests__/weights.test.ts`:

```typescript
it('excludes factors and redistributes weight', () => {
  const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
  const weights = priorityToWeights(order, { excludedFactors: ['sustainability', 'transparency'] })
  expect(weights.sustainability).toBe(0)
  expect(weights.transparency).toBe(0)
  expect(weights.quality).toBeGreaterThan(0)
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  expect(sum).toBeCloseTo(1.0, 5)
})

it('excluded factors get higher quality weight than all-included', () => {
  const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
  const normal = priorityToWeights(order)
  const excluded = priorityToWeights(order, { excludedFactors: ['sustainability', 'transparency', 'speed'] })
  expect(excluded.quality).toBeGreaterThan(normal.quality)
})

it('works with both complexity boost and exclusions', () => {
  const order: Factor[] = ['quality', 'capability', 'cost', 'transparency', 'privacy', 'sustainability', 'speed']
  const weights = priorityToWeights(order, {
    complexity: 'complex',
    excludedFactors: ['sustainability', 'transparency', 'speed'],
  })
  expect(weights.sustainability).toBe(0)
  expect(weights.quality).toBeGreaterThan(0.4) // should be dominant
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  expect(sum).toBeCloseTo(1.0, 5)
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/weights.test.ts`
Expected: FAIL — excluded factors still get weight

**Step 3: Implement exclusion**

Update `priorityToWeights` in `src/lib/weights.ts`. After computing `raw` and applying complexity boost, add:

```typescript
  // Zero out excluded factors
  const excluded = new Set(options?.excludedFactors ?? [])
  for (const factor of excluded) {
    raw[factor] = 0
  }
```

This goes between the complexity boost and the normalisation (the `total` calculation). Excluded factors get zeroed, then the remaining factors renormalise to sum to 1.0.

**Step 4: Run tests**

Run: `npm test -- src/lib/__tests__/weights.test.ts`
Expected: PASS (all existing + 6 new)

**Step 5: Commit**

```
feat: support factor exclusion in weight calculation

Excluded factors get zero weight, remaining factors renormalise.
Works in combination with complexity boost.
```

---

### Task 3: Wire exclusion through scoring and actions

**Files:**
- Modify: `src/lib/scoring.ts`
- Modify: `src/app/actions.ts`
- Test: `src/lib/__tests__/scoring.test.ts`

**Step 1: Add excludedFactors to ScoringInput**

In `src/lib/scoring.ts`, add to `ScoringInput` interface:

```typescript
excludedFactors?: string[]
```

Update the `priorityToWeights` call (~line 74):

```typescript
const weights = priorityToWeights(input.priorityOrder, {
  complexity: input.complexity,
  excludedFactors: input.excludedFactors,
})
```

**Step 2: Write a scoring test**

Add to `src/lib/__tests__/scoring.test.ts`:

```typescript
it('exclusions change rankings for complex code tasks', () => {
  const priorityOrder: Factor[] = ['quality', 'capability', 'speed', 'privacy', 'sustainability', 'transparency', 'cost']
  const normal = scoreModels({
    taskType: 'code', complexity: 'complex', inputLength: 'long',
    needsVision: false, needsTools: true, needsCode: true,
    priorityOrder,
  })
  const focused = scoreModels({
    taskType: 'code', complexity: 'complex', inputLength: 'long',
    needsVision: false, needsTools: true, needsCode: true,
    priorityOrder,
    excludedFactors: ['sustainability', 'transparency', 'privacy'],
  })
  // With exclusions + complexity boost, Opus should rank higher
  const normalOpus = normal.findIndex(m => m.slug === 'claude-opus-4.6')
  const focusedOpus = focused.findIndex(m => m.slug === 'claude-opus-4.6')
  expect(focusedOpus).toBeLessThan(normalOpus)
})
```

**Step 3: Update getResults in actions.ts**

In `getResults`, read `excluded_factors` from the task and pass it through. Around the `scoreModels` call (~line 161):

```typescript
const excludedFactors: string[] = task.excluded_factors
  ? (typeof task.excluded_factors === 'string'
      ? JSON.parse(task.excluded_factors)
      : task.excluded_factors)
  : []

const models = scoreModels({
  taskType: task.task_type,
  complexity: task.complexity,
  inputLength: task.input_length,
  needsVision: task.needs_vision,
  needsTools: task.needs_tools,
  needsCode: task.needs_code,
  priorityOrder,
  excludedFactors,
})
```

**Step 4: Update submitPriorities in actions.ts**

Change signature to accept excluded factors and save them:

```typescript
export async function submitPriorities(
  taskId: string,
  priorityOrder: Factor[],
  excludedFactors?: string[],
) {
  try {
    await updateTaskPriorities(taskId, priorityOrder, excludedFactors ?? [])
    redirect(`/recommend/${taskId}/results`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit priorities.' }
  }
}
```

**Step 5: Update db.ts**

```typescript
export async function updateTaskPriorities(
  taskId: string,
  priorityOrder: string[],
  excludedFactors?: string[],
): Promise<void> {
  await getDb()`
    UPDATE tasks
    SET priority_order = ${JSON.stringify(priorityOrder)},
        excluded_factors = ${excludedFactors && excludedFactors.length > 0 ? JSON.stringify(excludedFactors) : null}
    WHERE id = ${taskId}
  `
}
```

**Step 6: Run full test suite**

Run: `npm test`
Expected: All pass

**Step 7: Commit**

```
feat: wire factor exclusion through scoring and actions
```

---

### Task 4: Migration and priorities page UI

**Files:**
- Create: `src/db/migrations/008-excluded-factors.sql`
- Modify: `src/app/recommend/[taskId]/priorities/page.tsx`

**Step 1: Create migration**

```sql
-- 008: Add excluded_factors column for factor exclusion in scoring
-- Stores array of factor names the user chose to exclude. NULL = all factors included.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS excluded_factors JSONB DEFAULT NULL;
```

**Step 2: Run migration against Neon**

Use the same pattern as migration 007.

**Step 3: Add toggle UI to priorities page**

Update `src/app/recommend/[taskId]/priorities/page.tsx`:

- Add `enabled` state: `Record<Factor, boolean>` defaulting all to `true`
- Add a toggle button to each factor row
- Disabled factors are visually dimmed, not draggable, and excluded from rank numbers
- Enforce minimum 2 enabled factors
- Pass `excludedFactors` to `submitPriorities`

The toggle goes on the left side of each row, before the rank number. When toggled off:
- Row gets `opacity-40` and loses its rank number
- Factor is removed from the `priorityOrder` passed to the server
- The remaining enabled items are renumbered

**Step 4: Test in browser**

- Verify toggles work, minimum 2 enforced
- Verify excluded factors don't appear in the priority order
- Run a complex code query with sustainability/transparency/privacy excluded
- Confirm Opus 4.6 ranks much higher

**Step 5: Commit**

```
feat: add factor exclusion toggles to priorities page

Users can toggle off factors they don't care about. Disabled factors
get zero weight in scoring. Minimum 2 factors must remain enabled.
Adds migration 008 for excluded_factors column.
```

---

### Task 5: Verify end-to-end and clean up

**Step 1: Run full test suite**

Run: `npm test`

**Step 2: Run lint**

Run: `npx eslint src/lib/weights.ts src/lib/scoring.ts src/app/actions.ts src/lib/db.ts src/app/recommend/\[taskId\]/priorities/page.tsx`

**Step 3: Manual verification**

Run a complex code task through the full flow:
1. Describe a complex coding task
2. On priorities page, disable sustainability, transparency, privacy
3. Rank quality > capability > speed > cost
4. Verify Opus 4.6 and GPT-5.4 rank in top 5

**Step 4: Commit any fixes, push**
