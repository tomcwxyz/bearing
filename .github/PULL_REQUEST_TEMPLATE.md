## What problem does this solve?

Link the issue if there is one. Explain the user's or contributor's problem, not just the code change.

## What changed?

Describe the main changes and why this approach was chosen. Link sources for model/evidence corrections and note exact model or evaluation variants.

## How was this checked?

- [ ] `npm test` (or explain why not)
- [ ] `npm run eval:ranking` when recommendation behaviour may change (or explain why not)
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` where relevant
- [ ] Documentation/diagram updated where behaviour or relationships changed
- [ ] No credentials, personal data, private prompts or production exports included

**Commands run, results and limitations:**

<!-- Be specific about missing provider credentials or database integration tests. Repository CI does not yet test migrations against disposable PostgreSQL. -->

## Methodology and evidence (where relevant)

What assumptions, metrics, datasets, dates, variants, competing evidence or evaluation trade-offs are involved? Could we be making the decision less useful for a class of tasks?

## Data and deployment implications (where relevant)

Which tables, keys, migrations, source-of-truth records, existing data, API/CSV exports, privacy boundaries or licences are affected?

Describe backfill, compatibility, rollback or forward-fix, and how the change could be tested in an isolated database. **Do not request or share production Neon credentials.**
