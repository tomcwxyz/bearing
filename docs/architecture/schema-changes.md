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

## Testing SQL in isolation

The migrations are plain PostgreSQL SQL files. A contributor with Docker and `psql` can **optionally** apply the migration sequence to an empty, disposable PostgreSQL instance they own. This tests schema DDL, not the full Neon HTTP adapter or application workflows.

For example, from Git Bash / a POSIX shell:

```bash
docker run --rm -d --name bearing-contrib-pg \
  -e POSTGRES_PASSWORD=localonly \
  -e POSTGRES_DB=bearing \
  -p 54329:5432 postgres:16

export LOCAL_DATABASE_URL='postgresql://postgres:localonly@localhost:54329/bearing'

# Wait for the disposable container to accept connections, then:
for migration in src/db/migrations
