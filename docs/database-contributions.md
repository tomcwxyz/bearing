# Safe database contributions

Contributors do **not** need access to Bearing's maintained Neon database. You can propose schema improvements, run existing migrations on disposable PostgreSQL and demonstrate how synthetic records would behave.

## Start with the domain question

Describe what the current schema cannot represent. A model and its provider deployment, for example, might need different identities; an external benchmark variant may not map reliably to either. Show a synthetic example, what is uncertain, a suggested entity relationship and alternatives to adding a table.

Document impacts on historical evidence, published datasets, privacy, licensing, source provenance and downstream code. An unanswered but well evidenced question is a valid contribution.

## Run the migrations locally

Requirements: Node.js 22 or later and Docker Desktop (or a compatible Docker engine). From PowerShell, Git Bash or a macOS/Linux terminal:

```bash
npm run db:test:migrations
```

This script launches a randomly named, disposable PostgreSQL 16 container with **no published ports and no external network**, replays all active `src/db/migrations/*.sql` files in lexical order, verifies important schema constraints and tests a synthetic historical-selection backfill. It removes the container on success or failure.

Files ending `.sql.pending` are deliberately excluded, including migration 025. The script does not accept a database URL, does not read `NEON_DATABASE_URL`, and never needs credentials. If Docker is unavailable, it stops rather than falling back to a connected database.

### What the checks prove

- The existing migration history can build a fresh schema in PostgreSQL 16.
- Key tables and columns exist, and selected foreign keys and status constraints still work.
- Synthetic pre-032 selection metadata is backfilled with `snapshot_source=backfill_current_catalogue` rather than falsely marked as originally observed.
- Benchmark measurements can remain unmatched instead of being assigned an invented canonical model.
- The migration ledger and reserved migration numbers are checked.

### What they do not prove

The production migration runner (`scripts/run-migrations.ts`) executes SQL through the Neon HTTP client, splitting migrations into statements; the local test uses PostgreSQL `psql`. Passing does **not** validate Neon HTTP statement splitting, populated production data, runtime query compatibility, backfill performance or operational rollout. A migration file can be partially applied in production if one of its statements fails; contributor SQL should be re-runnable where practical.

## Pull request workflow

1. Open a discussion issue documenting the problem, example, trade-offs and proposed schema or public contract change.
2. Make changes on a feature branch. **Never rewrite a previously applied migration**. Reserve migration numbers already present in `.sql.pending` files, and coordinate with branches adding newer migrations.
3. Include SQL fixtures/assertions for new invariants and preserve historical interpretation. Review FK behaviour, null handling, unique constraints, indexes, versioning and potential data backfills.
4. Run `npm run db:test:migrations` plus relevant TypeScript, unit, ranking and build checks. Describe any tests that need a real adapter or development database.
5. Submit a pull request with a migration strategy, compatibility notes, rollback/forward-fix, external data reuse rights and privacy implications.

The GitHub workflow `.github/workflows/database-migrations.yml` executes this identical disposable test when migrations or the harness change. It uses repository read-only permissions and **no Neon secrets**, including on forks. CI never deploys database changes.

## Maintainer review and deployment

Maintainers decide if the domain change belongs in Bearing. Accepted changes should first be exercised on an isolated development Neon branch with the actual application and migration driver, plus any required backfill checks. Only after explicit approval should maintainers plan the production migration, considering backups, data size, failure handling and rollback.

Neither approval nor successful CI gives contributors access to live data. The public [data contract](public-data.md) and [rating methodology](model-ratings.md) are useful context for proposals.
