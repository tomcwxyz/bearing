# Contributing to Bearing

Bearing is an open-source decision and evaluation layer for AI work. Contributions to the code **and to the reasoning behind it** are welcome. You do **not** need access to our Neon database, production services, API keys, or private user data.

Start with the [contribution routes](docs/contributing/index.md) and [GitHub issue forms](https://github.com/tomcwxyz/bearing/issues/new/choose). The [methodology challenge guide](docs/contributing/methodology.md) explains how to question existing assumptions constructively; the [data-model guide](docs/architecture/data-model.md) describes the database without requiring a connection.

## Choose a route

| You want to… | Start here | Database required? |
| --- | --- | --- |
| Correct a model's details or flag an incorrect benchmark mapping | [Model or evidence correction](https://github.com/tomcwxyz/bearing/issues/new/choose) | No |
| Challenge a score, weighting, evidence source or evaluation method | [Methodology challenge](docs/contributing/methodology.md) | No |
| Propose a table, relationship or versioning change | [Data-model proposal](docs/architecture/schema-changes.md) | No |
| Improve documentation, tests, scoring or UI | Fork, branch and open a pull request | Usually no |
| Test persistence and SQL migrations | [Schema-change guide](docs/architecture/schema-changes.md) | Your **own isolated** PostgreSQL/Neon database, once a test workflow is available |

Issues, documentation changes and methodological contributions are as valuable as code contributions. Explain **why** something should change, link the evidence where possible, and acknowledge uncertainties.

## A safe development start

Node.js 22 and npm are used in CI. Start without secrets:

```bash
git clone https://github.com/tomcwxyz/bearing.git
cd bearing
npm ci
npm test
npm run eval:ranking
npx tsc --noEmit
npm run lint
npm run build
```

The build uses the checked-in model registry when `NEON_DATABASE_URL` is absent. **This is not a complete offline application mode**: pages and actions that query Neon or call external providers still require their own services. You can nevertheless work on pure scoring, validation, model evidence, tests and most documentation without those credentials.

To use features that require providers or a database, copy `.env.local.example` to `.env.local` and use credentials from accounts **you control**. Never use the maintainer's database, and never commit secrets, personal data, live task text, or a production export. Do not run migration/seed scripts against a shared environment.

## Model and benchmark evidence

- The committed `src/data/bearing-registry.json` is a **generated snapshot**, not a reliable canonical place for proposed edits. `scripts/generate-registry.ts` regenerates it from the `models` table, and `scripts/seed-models.ts` can write it back. A raw JSON patch may be overwritten; **open an evidence correction issue first**.
- Name the canonical model, exact deployment/evaluation variant and provider identifiers wherever known.
- Give the source, observation date, relevant metric and licence or reuse limits. Separate provider-stated claims, measurements, user reports and your own interpretations.
- A source that disagrees with our current score does not automatically prove either is wrong; mismatches should remain visible pending review.
- For task-fit or scoring changes, see the [model rating methodology](docs/model-ratings.md) and [task fitness rubric](docs/scoring/task-fitness-rubric.md).

## Pull requests

1. Open an issue first for significant behavioural, methodology or data-model changes. Small bug fixes or documentation improvements can go straight to a PR.
2. Fork the repository and create a focused branch. Keep unrelated database changes, provider integrations and UI refactors out of the same PR.
3. Add or change tests for executable behaviour. For schema changes, provide proposed SQL, a migration/backfill and compatibility/rollback analysis; the main database must not be touched to demonstrate the idea.
4. Run relevant checks from the commands above. Tell reviewers which you ran and which require services unavailable to you.
5. Open a PR explaining the problem, evidence, trade-offs, any privacy/licensing implications and how a maintainer can verify it.

PRs run repository CI without sharing production credentials. Checks passing does **not** mean a database migration has been tested on PostgreSQL: the current CI has no disposable database migration job. Maintainers review and apply accepted changes to managed environments.

## Principles for review

- Make decisions inspectable; state assumptions, sources and limitations.
- Separate **what a model can do**, **whether it is available**, **what benchmarks say**, and **what people actually experienced**.
- Keep identifiers and historical exports stable unless a documented migration/compatibility plan is agreed.
- Prefer focused, reversible changes. Challenge the methodology as freely as the code.
- Don't treat a weighted score as a calibrated likelihood of success.

Code is covered by the repository's [MIT licence](LICENSE). The generated registry declares its own CC BY-NC 4.0 metadata; do not assume that all data or third-party benchmark sources are MIT licensed. Check provenance and reuse terms before contributing datasets.

Questions are welcome via [GitHub Issues](https://github.com/tomcwxyz/bearing/issues).
