# Admin Dashboard Design

> Date: 2026-04-13
> Status: Approved

## Goal

Add usage monitoring and product insight tabs to the existing `/admin` page, giving the admin a clear view of how the app is being used and whether recommendations are good.

## Approach

Tabbed interface within `/admin` — three tabs: **Models** (existing), **Usage** (operational), **Insights** (product intelligence). Real-time queries on every load (no caching). Recharts for charts. Selectable time granularity (daily/weekly/monthly).

## Tab structure

| Tab | Purpose |
|-----|---------|
| Models | Existing model list + edit/add (already built) |
| Usage | Operational monitoring — traffic, users, activity counts |
| Insights | Product intelligence — task patterns, model leaderboard, outcome quality |

URL: `/admin?tab=models` / `?tab=usage` / `?tab=insights`. Bookmarkable.

## Usage tab

**Summary cards:**
- Total tasks
- Total users
- Total selections
- Total comparisons

**Charts:**
1. **Activity over time** (line chart) — tasks created per period, with granularity toggle (day/week/month)
2. **Mode breakdown** (bar chart) — recommend vs validate vs compare
3. **Daily active users** (line chart) — unique users per period

## Insights tab

**Summary cards:**
- Outcome success rate (%)
- Average selected rank
- Most requested task type
- Most selected model

**Charts / tables:**
1. **Task type distribution** (bar chart) — count per task type
2. **Model leaderboard** (table) — model name, times recommended, times selected, selection rate, avg rank when selected
3. **Outcome breakdown** (bar chart) — success vs failure, sub-breakdown by failure reason
4. **Capability demand** (bar chart) — how often tasks need vision, code, tools, etc.

Granularity toggle applies to time-series charts. Leaderboard and capability demand are cumulative.

## Data layer

All queries in `src/lib/dashboard.ts`:

| Function | Returns |
|----------|---------|
| `getUsageSummary()` | total tasks, users, selections, comparisons |
| `getActivityOverTime(granularity)` | `{period, tasks, selections}[]` |
| `getModeBreakdown()` | `{mode, count}[]` |
| `getInsightsSummary()` | success rate, avg rank, top task type, top model |
| `getTaskTypeDistribution()` | `{task_type, count}[]` |
| `getModelLeaderboard()` | `{slug, name, recommended, selected, rate, avg_rank}[]` |
| `getOutcomeBreakdown()` | `{success, failure_reason, count}[]` |
| `getCapabilityDemand()` | `{capability, count}[]` |

Time-series functions use Postgres `date_trunc()` with `'day' | 'week' | 'month'` parameter.

Server actions in `src/app/admin/actions.ts` wrap queries behind `requireAdmin()`.

## Component structure

```
src/app/admin/
  page.tsx              — server component: auth check, fetch initial data
  admin-tabs.tsx        — client component: tab switching, URL sync
  models-table.tsx      — extracted from current page.tsx
  usage-tab.tsx         — summary cards + Recharts charts
  insights-tab.tsx      — summary cards + charts + leaderboard table
  granularity-toggle.tsx — daily/weekly/monthly toggle
  actions.ts            — add dashboard server actions
```

Server component fetches default data (daily granularity), passes as props. Client calls server actions when granularity changes.

## Tech

- **Recharts** (~40KB gzipped) — LineChart, BarChart, ResponsiveContainer
- **Styling** — existing palette: navy, cream, teal, coral, amber from globals.css
- **No caching** — real-time DB queries, add caching later if needed

## What's not included

- Date range picker (default to all time)
- Export/download of dashboard data
- Alerting or thresholds
- Comparison-specific analytics (not enough data yet)
