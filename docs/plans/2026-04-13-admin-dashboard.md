# Admin Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Usage and Insights tabs to the admin panel with real-time charts and metrics powered by Recharts.

**Architecture:** Server component fetches default data and checks auth. Client components handle tab switching, granularity toggle, and chart rendering. All DB queries live in `src/lib/dashboard.ts`, exposed via admin-gated server actions. Recharts renders line and bar charts using the existing color palette.

**Tech Stack:** Recharts (new dependency), Neon Postgres (date_trunc for time series), Next.js server actions, existing admin auth.

---

### Task 1: Install Recharts

**Files:**
- Modify: `package.json`

**Step 1: Install dependency**

Run: `npm install recharts`

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts dependency for admin dashboard"
```

---

### Task 2: Dashboard query functions

**Files:**
- Create: `src/lib/dashboard.ts`
- Create: `src/lib/__tests__/dashboard.test.ts`

**Step 1: Write the test**

```typescript
// src/lib/__tests__/dashboard.test.ts
import { describe, it, expect } from 'vitest'
import { formatGranularity } from '../dashboard'

describe('formatGranularity', () => {
  it('accepts day, week, month', () => {
    expect(formatGranularity('day')).toBe('day')
    expect(formatGranularity('week')).toBe('week')
    expect(formatGranularity('month')).toBe('month')
  })

  it('defaults to day for invalid input', () => {
    expect(formatGranularity('year')).toBe('day')
    expect(formatGranularity('')).toBe('day')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/dashboard.test.ts`
Expected: FAIL — `formatGranularity` doesn't exist.

**Step 3: Write dashboard.ts**

```typescript
// src/lib/dashboard.ts
import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export type Granularity = 'day' | 'week' | 'month'

export function formatGranularity(input: string): Granularity {
  if (input === 'day' || input === 'week' || input === 'month') return input
  return 'day'
}

// -- Usage queries --

export interface UsageSummary {
  totalTasks: number
  totalUsers: number
  totalSelections: number
  totalComparisons: number
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const db = getDb()
  const [tasks] = await db`SELECT COUNT(*)::int as count FROM tasks`
  const [users] = await db`SELECT COUNT(*)::int as count FROM users`
  const [selections] = await db`SELECT COUNT(*)::int as count FROM selections`
  const [comparisons] = await db`SELECT COUNT(*)::int as count FROM comparisons`
  return {
    totalTasks: tasks.count,
    totalUsers: users.count,
    totalSelections: selections.count,
    totalComparisons: comparisons.count,
  }
}

export interface ActivityPoint {
  period: string
  tasks: number
  selections: number
}

export async function getActivityOverTime(granularity: Granularity): Promise<ActivityPoint[]> {
  const db = getDb()
  const rows = await db`
    SELECT
      to_char(date_trunc(${granularity}, t.period), 'YYYY-MM-DD') as period,
      COALESCE(t.task_count, 0)::int as tasks,
      COALESCE(s.sel_count, 0)::int as selections
    FROM (
      SELECT date_trunc(${granularity}, created_at) as period, COUNT(*)::int as task_count
      FROM tasks
      GROUP BY 1
    ) t
    LEFT JOIN (
      SELECT date_trunc(${granularity}, created_at) as period, COUNT(*)::int as sel_count
      FROM selections
      GROUP BY 1
    ) s ON t.period = s.period
    ORDER BY t.period
  `
  return rows as ActivityPoint[]
}

export interface ModeCount {
  mode: string
  count: number
}

export async function getModeBreakdown(): Promise<ModeCount[]> {
  const db = getDb()
  const rows = await db`
    SELECT COALESCE(mode, 'recommend') as mode, COUNT(*)::int as count
    FROM tasks
    GROUP BY 1
    ORDER BY count DESC
  `
  return rows as ModeCount[]
}

export interface SignupPoint {
  period: string
  signups: number
}

export async function getSignupsOverTime(granularity: Granularity): Promise<SignupPoint[]> {
  const db = getDb()
  const rows = await db`
    SELECT
      to_char(date_trunc(${granularity}, created_at), 'YYYY-MM-DD') as period,
      COUNT(*)::int as signups
    FROM users
    GROUP BY 1
    ORDER BY 1
  `
  return rows as SignupPoint[]
}

// -- Insights queries --

export interface InsightsSummary {
  successRate: number | null
  avgSelectedRank: number | null
  topTaskType: string | null
  topModel: string | null
}

export async function getInsightsSummary(): Promise<InsightsSummary> {
  const db = getDb()

  const [outcome] = await db`
    SELECT
      CASE WHEN COUNT(*) > 0
        THEN ROUND(100.0 * COUNT(*) FILTER (WHERE success = true) / COUNT(*))::int
        ELSE NULL
      END as success_rate
    FROM outcomes
  `

  const [rank] = await db`
    SELECT ROUND(AVG(recommended_rank)::numeric, 1)::float as avg_rank
    FROM selections
    WHERE recommended_rank IS NOT NULL
  `

  const topType = await db`
    SELECT task_type, COUNT(*)::int as count
    FROM tasks
    WHERE task_type IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 1
  `

  const topModel = await db`
    SELECT model_slug, COUNT(*)::int as count
    FROM selections
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 1
  `

  return {
    successRate: outcome.success_rate,
    avgSelectedRank: rank.avg_rank,
    topTaskType: topType.length > 0 ? topType[0].task_type : null,
    topModel: topModel.length > 0 ? topModel[0].model_slug : null,
  }
}

export interface TaskTypeCount {
  taskType: string
  count: number
}

export async function getTaskTypeDistribution(): Promise<TaskTypeCount[]> {
  const db = getDb()
  const rows = await db`
    SELECT task_type as "taskType", COUNT(*)::int as count
    FROM tasks
    WHERE task_type IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC
  `
  return rows as TaskTypeCount[]
}

export interface LeaderboardEntry {
  slug: string
  name: string
  recommended: number
  selected: number
  rate: number
  avgRank: number | null
}

export async function getModelLeaderboard(): Promise<LeaderboardEntry[]> {
  const db = getDb()
  const rows = await db`
    SELECT
      r.model_slug as slug,
      COALESCE(m.name, r.model_slug) as name,
      r.rec_count::int as recommended,
      COALESCE(s.sel_count, 0)::int as selected,
      CASE WHEN r.rec_count > 0
        THEN ROUND(100.0 * COALESCE(s.sel_count, 0) / r.rec_count)::int
        ELSE 0
      END as rate,
      s.avg_rank::float as "avgRank"
    FROM (
      SELECT model_slug, COUNT(*) as rec_count
      FROM recommendations
      GROUP BY 1
    ) r
    LEFT JOIN (
      SELECT model_slug, COUNT(*) as sel_count, AVG(recommended_rank) as avg_rank
      FROM selections
      GROUP BY 1
    ) s ON r.model_slug = s.model_slug
    LEFT JOIN models m ON r.model_slug = m.slug
    ORDER BY selected DESC, recommended DESC
  `
  return rows as LeaderboardEntry[]
}

export interface OutcomeCount {
  label: string
  count: number
}

export async function getOutcomeBreakdown(): Promise<OutcomeCount[]> {
  const db = getDb()
  const rows = await db`
    SELECT
      CASE
        WHEN success = true THEN 'Success'
        WHEN success = false THEN COALESCE(failure_reason, 'Failed (no reason)')
        ELSE 'No outcome'
      END as label,
      COUNT(*)::int as count
    FROM outcomes
    GROUP BY 1
    ORDER BY count DESC
  `
  return rows as OutcomeCount[]
}

export interface CapabilityCount {
  capability: string
  count: number
}

export async function getCapabilityDemand(): Promise<CapabilityCount[]> {
  const db = getDb()
  const rows = await db`
    SELECT capability, COUNT(*)::int as count
    FROM (
      SELECT 'vision' as capability FROM tasks WHERE needs_vision = true
      UNION ALL
      SELECT 'tools' FROM tasks WHERE needs_tools = true
      UNION ALL
      SELECT 'code' FROM tasks WHERE needs_code = true
    ) caps
    GROUP BY 1
    ORDER BY count DESC
  `
  return rows as CapabilityCount[]
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/dashboard.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `npm test`
Expected: All pass.

**Step 6: Commit**

```bash
git add src/lib/dashboard.ts src/lib/__tests__/dashboard.test.ts
git commit -m "feat: add dashboard query functions"
```

---

### Task 3: Dashboard server actions

**Files:**
- Modify: `src/app/admin/actions.ts`

**Step 1: Add dashboard actions**

Add to the end of `src/app/admin/actions.ts`:

```typescript
import {
  getUsageSummary, getActivityOverTime, getModeBreakdown, getSignupsOverTime,
  getInsightsSummary, getTaskTypeDistribution, getModelLeaderboard,
  getOutcomeBreakdown, getCapabilityDemand,
  formatGranularity,
  type UsageSummary, type ActivityPoint, type ModeCount, type SignupPoint,
  type InsightsSummary, type TaskTypeCount, type LeaderboardEntry,
  type OutcomeCount, type CapabilityCount,
} from '@/lib/dashboard'

export type { UsageSummary, ActivityPoint, ModeCount, SignupPoint }
export type { InsightsSummary, TaskTypeCount, LeaderboardEntry, OutcomeCount, CapabilityCount }

export async function fetchUsageData(granularityRaw: string): Promise<{
  summary: UsageSummary
  activity: ActivityPoint[]
  modes: ModeCount[]
  signups: SignupPoint[]
}> {
  await requireAdmin()
  const granularity = formatGranularity(granularityRaw)
  const [summary, activity, modes, signups] = await Promise.all([
    getUsageSummary(),
    getActivityOverTime(granularity),
    getModeBreakdown(),
    getSignupsOverTime(granularity),
  ])
  return { summary, activity, modes, signups }
}

export async function fetchInsightsData(): Promise<{
  summary: InsightsSummary
  taskTypes: TaskTypeCount[]
  leaderboard: LeaderboardEntry[]
  outcomes: OutcomeCount[]
  capabilities: CapabilityCount[]
}> {
  await requireAdmin()
  const [summary, taskTypes, leaderboard, outcomes, capabilities] = await Promise.all([
    getInsightsSummary(),
    getTaskTypeDistribution(),
    getModelLeaderboard(),
    getOutcomeBreakdown(),
    getCapabilityDemand(),
  ])
  return { summary, taskTypes, leaderboard, outcomes, capabilities }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add src/app/admin/actions.ts
git commit -m "feat: add dashboard server actions"
```

---

### Task 4: Granularity toggle component

**Files:**
- Create: `src/app/admin/granularity-toggle.tsx`

**Step 1: Write the component**

```typescript
'use client'

import type { Granularity } from '@/lib/dashboard'

const OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

export default function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity
  onChange: (g: Granularity) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-cream-dark p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-navy text-cream'
              : 'text-navy/60 hover:text-navy'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/admin/granularity-toggle.tsx
git commit -m "feat: add granularity toggle component"
```

---

### Task 5: Extract models table to its own component

**Files:**
- Create: `src/app/admin/models-table.tsx`
- Modify: `src/app/admin/page.tsx`

**Step 1: Create models-table.tsx**

Extract the models table JSX from the current `page.tsx` into a client component that accepts `models` as a prop. Include the "Add Model" button and the model count subtitle. The component should be `'use client'` since it will be rendered conditionally by the tab switcher.

```typescript
'use client'

import Link from 'next/link'
import type { Model } from '@/lib/registry'

export default function ModelsTable({ models }: { models: Model[] }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-navy/60">
          {models.length} models in registry
        </p>
        <Link href="/admin/models/new" className="btn-primary text-sm">
          Add Model
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-cream-dark">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-dark/60">
            <tr>
              <th className="px-3 py-2 font-medium text-navy">Name</th>
              <th className="px-3 py-2 font-medium text-navy">Provider</th>
              <th className="px-3 py-2 font-medium text-navy">Tier</th>
              <th className="px-3 py-2 font-medium text-navy">Speed</th>
              <th className="px-3 py-2 font-medium text-navy">Pricing</th>
              <th className="px-3 py-2 font-medium text-navy"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {models.map((model) => (
              <tr key={model.slug} className="hover:bg-cream-dark/20">
                <td className="px-3 py-2">
                  <div className="font-medium text-navy">{model.name}</div>
                  <div className="font-mono text-xs text-navy/50">{model.slug}</div>
                </td>
                <td className="px-3 py-2 text-navy/70">{model.provider}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-cream-dark px-2 py-0.5 font-mono text-xs text-navy">
                    {model.tier.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-navy/70">
                  {model.speed_score.toFixed(2)}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-navy/70">
                  ${model.pricing.input_per_1m}/{model.pricing.output_per_1m}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/models/${model.slug}`}
                    className="text-teal hover:text-teal-light text-sm underline underline-offset-2"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add src/app/admin/models-table.tsx
git commit -m "feat: extract models table to standalone component"
```

---

### Task 6: Usage tab component

**Files:**
- Create: `src/app/admin/usage-tab.tsx`

**Step 1: Write the component**

A client component that receives initial usage data as props, renders summary cards and Recharts charts, and calls `fetchUsageData` when granularity changes.

Summary cards: Total tasks, Total users, Total selections, Total comparisons.

Charts:
1. Activity over time (LineChart — tasks + selections lines)
2. Mode breakdown (BarChart — horizontal)
3. User signups over time (LineChart)

Use the project palette: teal (`#2D8B7A`) for primary lines, coral (`#C75B3A`) for secondary, navy (`#1B2A4A`) for text/axes, cream-dark (`#E8E0D0`) for grid lines.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add src/app/admin/usage-tab.tsx
git commit -m "feat: add usage tab with summary cards and charts"
```

---

### Task 7: Insights tab component

**Files:**
- Create: `src/app/admin/insights-tab.tsx`

**Step 1: Write the component**

A client component that receives initial insights data as props.

Summary cards: Success rate, Avg selected rank, Top task type, Top model.

Charts/tables:
1. Task type distribution (BarChart — horizontal)
2. Model leaderboard (HTML table — slug, name, recommended, selected, rate%, avg rank)
3. Outcome breakdown (BarChart)
4. Capability demand (BarChart)

Same palette as usage tab.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 3: Commit**

```bash
git add src/app/admin/insights-tab.tsx
git commit -m "feat: add insights tab with charts and leaderboard"
```

---

### Task 8: Admin tabs component and page rewrite

**Files:**
- Create: `src/app/admin/admin-tabs.tsx`
- Modify: `src/app/admin/page.tsx`

**Step 1: Write admin-tabs.tsx**

A client component that:
- Reads `?tab=` from the URL (default: `models`)
- Renders three tab buttons (Models, Usage, Insights)
- Conditionally renders `ModelsTable`, `UsageTab`, or `InsightsTab`
- Updates the URL via `router.replace` when switching tabs (no full reload)

```typescript
'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import ModelsTable from './models-table'
import UsageTab from './usage-tab'
import InsightsTab from './insights-tab'
import type { Model } from '@/lib/registry'
// Import the data types from actions

const TABS = [
  { key: 'models', label: 'Models' },
  { key: 'usage', label: 'Usage' },
  { key: 'insights', label: 'Insights' },
] as const

type TabKey = typeof TABS[number]['key']

export default function AdminTabs({ models, initialUsage, initialInsights }: {
  models: Model[]
  initialUsage: any   // UsageData type
  initialInsights: any // InsightsData type
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = (searchParams.get('tab') as TabKey) || 'models'

  function setTab(tab: TabKey) {
    router.replace(`/admin?tab=${tab}`, { scroll: false })
  }

  return (
    <>
      {/* Tab bar */}
      <div className="mt-6 flex gap-1 border-b border-cream-dark">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'border-b-2 border-teal text-navy'
                : 'text-navy/50 hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === 'models' && <ModelsTable models={models} />}
        {activeTab === 'usage' && <UsageTab initialData={initialUsage} />}
        {activeTab === 'insights' && <InsightsTab initialData={initialInsights} />}
      </div>
    </>
  )
}
```

**Step 2: Rewrite page.tsx**

The server component now fetches models + default usage + default insights data, and passes them all to `AdminTabs`. The page remains the auth gatekeeper.

```typescript
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin, getAllModelsFromDb } from '@/lib/db'
import { getUsageSummary, getActivityOverTime, getModeBreakdown, getSignupsOverTime } from '@/lib/dashboard'
import { getInsightsSummary, getTaskTypeDistribution, getModelLeaderboard, getOutcomeBreakdown, getCapabilityDemand } from '@/lib/dashboard'
import AdminTabs from './admin-tabs'

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')

  const admin = await isUserAdmin(user.id)
  if (!admin) redirect('/')

  const [models, usageSummary, activity, modes, signups, insightsSummary, taskTypes, leaderboard, outcomes, capabilities] = await Promise.all([
    getAllModelsFromDb(),
    getUsageSummary(),
    getActivityOverTime('day'),
    getModeBreakdown(),
    getSignupsOverTime('day'),
    getInsightsSummary(),
    getTaskTypeDistribution(),
    getModelLeaderboard(),
    getOutcomeBreakdown(),
    getCapabilityDemand(),
  ])

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <h1 className="font-display text-4xl text-navy">Admin</h1>

        <AdminTabs
          models={models}
          initialUsage={{ summary: usageSummary, activity, modes, signups }}
          initialInsights={{ summary: insightsSummary, taskTypes, leaderboard, outcomes, capabilities }}
        />
      </div>
    </div>
  )
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build passes.

**Step 4: Run all tests**

Run: `npm test`
Expected: All pass.

**Step 5: Commit**

```bash
git add src/app/admin/admin-tabs.tsx src/app/admin/page.tsx
git commit -m "feat: rewrite admin page with tabbed layout"
```

---

### Task 9: Verify and polish

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Smoke test**

- Navigate to `/admin` — should show Models tab by default
- Click Usage tab — should show summary cards and charts
- Click Insights tab — should show summary cards, charts, and leaderboard
- Toggle granularity on Usage tab — charts should update
- Click back to Models — table should still work, Edit links functional
- Check URL updates: `?tab=usage`, `?tab=insights`, `?tab=models`
- Refresh page on Usage tab — should load directly to Usage (bookmarkable)

**Step 3: Run lint**

Run: `npm run lint`
Expected: No new errors from dashboard code.

**Step 4: Run build**

Run: `npm run build`
Expected: Clean build.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish admin dashboard"
```

---

### Task 10: Update project files

**Files:**
- Modify: `PLAN.md`
- Modify: `STATE.md`

**Step 1: Update PLAN.md**

Add admin dashboard to Sprint 4 tasks.

**Step 2: Update STATE.md**

Add dashboard components to component status table.

**Step 3: Commit**

```bash
git add PLAN.md STATE.md
git commit -m "docs: update project files for admin dashboard"
```

---

## Dependency Graph

```
Task 1 (recharts) ──→ Task 6 (usage tab)
                  ──→ Task 7 (insights tab)
Task 2 (queries)  ──→ Task 3 (actions) ──→ Task 6
                                        ──→ Task 7
Task 4 (toggle)   ──→ Task 6
Task 5 (extract)  ──→ Task 8 (tabs + page rewrite)
Task 6 ──→ Task 8
Task 7 ──→ Task 8
Task 8 ──→ Task 9 (verify)
Task 9 ──→ Task 10 (docs)
```

Tasks 1, 2, 4, 5 can run in parallel.
Tasks 6 and 7 can run in parallel (both depend on 1+2+3).
