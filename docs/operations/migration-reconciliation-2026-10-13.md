# Production migration reconciliation — 13 October 2026

**Status: investigation and read-only checks completed; ledger NOT reconciled.** Do not run the migration runner against production until the discrepancy is resolved. This is an operational record, not proof that a numbered migration has been applied in full.

## What we observed

On 13 October 2026 the Bearing Neon project `sparkling-credit-57973289`, primary branch `production`, had:

- `schema_migrations` entries only through `024_password_auth.sql` (last recorded 29 July 2026);
- a `benchmark_refresh_runs` table corresponding to migration **034**, with successful Text, WebDev and Vision jobs recorded on 12 October;
- a `model_availability_observations` table corresponding to **035**, including observations from 12 October;
- `models.retired_at`, `models.retirement_reason`, `models.retired_by` and `model_lifecycle_events` corresponding to **036**; 2 legacy models are retired and 80 are live;
- **no basis to conclude that every statement in 025–036 was run, or that all indexes/constraints/backfills match the files** merely because selected objects exist.

Migration **037** (`037_reviewed_model_evidence.sql`) is reserved by PR #132, not part of the 13 October production release. Migration `025_*.sql.pending` is intentionally not eligible for the automatic runner; preserve that reservation. Before adding a new migration, check ALL open PRs and numbered `.sql.pending` files, not just master.

The usual CLI reads `schema_migrations` to decide which files to execute. Since 034–036 are not recorded, blindly running it can replay data updates and DDL. Neon HTTP runs the statements separately: a failed file can be **partially applied**. The 13 October guard in `scripts/run-migrations.ts` now refuses a normal run if objects associated with untracked 034–037 are already present. This guard is *not* a comprehensive migration audit.

## Read-only production audit

Connect to the **intended** Neon project and branch, verify the connection details before executing anything, and run these queries. They do not modify data.

```sql
SELECT filename, applied_at
FROM public.schema_migrations
ORDER BY filename;

SELECT
  to_regclass('public.benchmark_refresh_runs') AS migration_034_table,
  to_regclass('public.model_availability_observations') AS migration_035_table,
  to_regclass('public.model_lifecycle_events') AS migration_036_ledger,
  to_regclass('public.model_evidence_reviews') AS migration_037_table;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    table_name IN ('benchmark_refresh_runs', 'model_availability_observations',
                   'model_lifecycle_events', 'model_evidence_reviews')
    OR (table_name = 'models' AND column_name IN
      ('retired_at', 'retirement_reason', 'retired_by'))
  )
ORDER BY table_name, ordinal_position;

SELECT c.conrelid::regclass AS table_name, c.conname,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid IN (
  'public.models'::regclass,
  'public.benchmark_refresh_runs'::regclass,
  'public.model_availability_observations'::regclass,
  'public.model_lifecycle_events'::regclass
)
ORDER BY table_name, c.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'benchmark_refresh_runs', 'model_availability_observations',
    'model_lifecycle_events', 'models'
  )
ORDER BY tablename, indexname;
```

Additional read-only invariants:

```sql
SELECT count(*) FILTER (WHERE active AND retired_at IS NOT NULL) AS invalid_retirements,
       count(*) FILTER (WHERE active AND retired_at IS NULL) AS live,
       count(*) FILTER (WHERE NOT active AND retired_at IS NULL) AS drafts,
       count(*) FILTER (WHERE retired_at IS NOT NULL) AS retired
FROM public.models;

SELECT source, subset, status, max(started_at) AS last_started,
       max(completed_at) AS last_finished
FROM public.benchmark_refresh_runs
GROUP BY source, subset, status
ORDER BY last_started DESC;
```

Reconcile **each missing number**, including 025–033, against the actual file on master or the approved deployment commit. Verify expected columns, indexes, constraints, data migrations and dependencies; investigate any difference before classing it as complete. Empty tables and merely existing columns are not proof. Run `npm run db:test:migrations` from PR #124 (once merged) on isolated local PostgreSQL for sequence validation, plus the real Neon adapter on a disposable development branch. Do not point either at production during investigation.

## Resolution procedure (maintainer approval required)

1. Preserve a timestamped schema snapshot and record the code commit, project/branch, migration file checksums, and findings for **every** untracked migration.
2. Identify whether each migration is **complete**, **partially applied**, or **not applied**. Stop if uncertain; repair partial application with a reviewed forward-only change or a tested, idempotent completion plan.
3. For confirmed complete files, propose a **ledger-only reconciliation**, reviewed separately. The ledger `applied_at` would then be the date of *reconciliation*, not the historical SQL execution date; record the actual history or its uncertainty in this document.
4. Test the full ledger and migration runner `--dry-run` on a disposable Neon branch. Compare table/constraint/index definitions and backfilled rows with production expectations.
5. Only after approval, reconcile the production ledger, then use `--dry-run` to verify **zero unexpectedly pending migrations**. Run actual new migrations through a controlled deployment, never through an unexamined catch-up.
6. Do not revise previously deployed numbered SQL files to make the ledger pass. Changes require new migration files and an explicit rollout.

See [safe database contributions](../database-contributions.md) (merged via PR #136) and [schema-change guidance](../architecture/schema-changes.md) (merged via PR #137) for the contributor-facing approach.

## Catalogue checks made alongside this review

On 12 October the catalogue job checked 66/80 live models; 55 were current, 10 attention, 1 unavailable, 14 unknown. The unavailable route was `qwen/qwen3-235b-a22b`: **do not substitute the 2507 variant as an equivalent model** without a separate model identity and editorial review. A missing route is not grounds for a blind slug rewrite. See the companion catalogue confidence runbook for the review queue.

No production SQL mutation or migration replay was performed as part of this investigation.

## Follow-up — 23 October 2026

A fresh read-only production check again found **24** ledger entries ending at `024_password_auth.sql`, with `benchmark_refresh_runs`, `model_availability_observations` and `model_lifecycle_events` present, but `model_evidence_reviews` absent. These checks do **not** certify migrations 025–036 as complete. We have not inserted any missing ledger entries and have not run the migration runner on production.

Created a disposable Neon child branch of production, `br-jolly-sky-abh946pv` (`bearing-contributions-reconciliation-20261023`), and applied migration 037's table and index SQL in a transaction **only on that child branch**. Follow-up read confirmed `model_evidence_reviews` exists with zero rows; its copied ledger still stops at 024. This establishes that the isolated DDL executes, **not** that the production migration chain is reconciled or safe to advance.

The current contributor workbench is merged through PR #144. The reviewed evidence system is staged in PR #145. Do not merge/deploy its review interface as production-ready until the per-migration audit of 025–036, ledger reconciliation, production dry-run, and controlled application of 037 are complete. Track this work in issue #143.
