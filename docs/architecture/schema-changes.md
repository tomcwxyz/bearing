# Propose a database change without Neon access

You do not need access to the maintained Neon database to suggest or review Bearing's tables, identifiers or relationships. Start with the **domain problem**, not the SQL.

Read the [data model](data-model.md) and [public data contract](../public-data.md) before proposing a schema change.

## The proposal route

1. Open a [data-model proposal issue](https://github.com/tomcwxyz/bearing/issues/new/choose). Explain the ambiguity or limitation using public or **synthetic** records.
2. Discuss naming, keys, cardinality, provenance, historical data, retention and privacy. For lasting changes, add a [proposed decision record](decisions/0000-template.md).
3. If accepted for implementation, submit a PR with **a new versioned migration** under `src/db/migrations/`, changes to repository/domain interfaces under `src/db/` where needed, tests and updated diagrams/documentation.
4. Document any impact on model registry regeneration, API consumers and the [public dataset schema versions](../public-data.md).
5. Maintainers review and arrange tests against a disposable database, then separately approve application to managed environments.

An issue can be a successful contribution even if implementation is deferred.

## Versioning and compatibility

- **Never rewrite an already-applied migration.** Add the next appropriately numbered `.sql` migration, coordinated with current development. Check the latest branch before choosing its number.
- Prefer additive and reversible changes: new nullable fields, separate tables, carefully staged indexes and explicit backfill.
- Avoid changes that silently reinterpret old outcomes, historical snapshots or benchmark variants.
- Model-slug strings are not uniformly constrained by foreign keys. Account for their presence in rows, generated JSON, caches and exports before renaming slugs.
- Keep user and private execution data out of open fixtures. Do not introduce raw prompts or personal data just because a new table would make it easy.
- Document source dates, licences, classification/schema versions and how unknown/unmatched evidence is represented.
- Make the rollback or forward-fix plan explicit; removing an indexed column or rewriting records may not be reversible.

The current migration-testing workflow is documented in [safe database contributions](../database-contributions.md). The **production migration ledger/schema mismatch** found on 13 October 2026 must be resolved using the [read-only reconciliation procedure](../operations/migration-reconciliation-2026-10-13.md) before running migrations against production.

## Testing SQL in isolation

Use the credentials-free, disposable database harness. It launches an isolated PostgreSQL 16 Docker container with no published ports or external network, applies active `src/db/migrations/*.sql` in order and checks synthetic schema and historical-data invariants.

```bash
npm ci
npm run db:test:migrations
```

Node.js 22+ and Docker Desktop (or another working Docker engine) are required. Files ending `.sql.pending` remain excluded, including the reserved 025 migration. The harness **never** accepts a Neon connection URL and can be run by contributors on Windows, macOS or Linux.

A passing result proves only that the versioned SQL builds a fresh **PostgreSQL** schema and that selected constraints/backfills work with synthetic data. It does **not** prove that the live production schema matches the migration ledger or that the Neon HTTP migration runner can apply every statement. Refer to [safe database contributions](../database-contributions.md) for coverage and limits.

Never run `scripts/run-migrations.ts`, a seed script, or manual SQL against production to test a contribution. Maintainers must independently review and explicitly approve any deployment of schema changes.
