# Explore Bearing without credentials

You can make and test meaningful recommendations changes without access to the maintained Neon database or paid AI accounts.

## One command

With Node.js 22 and npm installed:

```bash
git clone https://github.com/tomcwxyz/bearing.git
cd bearing
npm ci
npm run dev:demo
```

Visit [http://localhost:3000/demo](http://localhost:3000/demo). The launcher sets local development mode, masks any existing `NEON_DATABASE_URL` or provider keys, and starts the usual Next.js development server. No special Windows shell syntax is needed.

Choose a **synthetic, pre-classified task** and change what matters most. Compare the ranking, hard-gate exclusion counts, weighted factors, estimated costs and meaningful alternatives. The standard **Models** catalogue and detail screens also use the committed registry when the workbench is on.

## What is real?

- The exact production `scoreModelsDetailed` function and its current hard eligibility gates.
- The same priority weighting and meaningful alternative selection used for live tasks.
- The checked-in model snapshot, including its published task fitness and other evidence fields.
- A set of synthetic tasks covering summarisation, code, personally sensitive analysis, embeddings and multilingual work.

No database writes, logins, external provider calls, or prompts are made from the workbench. The launcher sets keys and `NEON_DATABASE_URL` to empty explicitly so accidentally-present local secrets are not used.

## What is *not* simulated?

- A free-text task description is **not classified by AI** in this mode. Choose a pre-classified scenario.
- No live benchmark refresh, model execution, account login, feedback persistence, pairwise comparisons or historic data exports occur.
- The committed catalogue may be stale. The UI prints its snapshot date.
- Cost estimates and weighted scores are **illustrative** and must not be confused with probabilities or measured user outcomes.

This mode only runs when `BEARING_CONTRIBUTOR_DEMO=1` **and** the Next.js runtime is in development. Production and preview builds respond with 404 on `/demo`; the server action also enforces the same guard.

## Test your change

```bash
npm test
npm run eval:ranking
npx tsc --noEmit
npm run lint
npm run build
```

To run the focused workbench fixtures independently:

```bash
npx vitest run src/lib/__tests__/contributor-fixtures.test.ts
```

These tests use synthetic tasks and the versioned catalogue. They do not require a PostgreSQL database. Database migration work still needs isolated PostgreSQL testing; this workbench does not pretend to validate schema changes.

## Make an evidence or methodology contribution

If changing a factor or gate makes a recommendation better in one scenario but worse in another, that's valuable evidence. Include the synthetic task, chosen focus, new rank, the trade-off you observed and why you think the changed behaviour is useful.

Open an issue at [Bearing GitHub Issues](https://github.com/tomcwxyz/bearing/issues/new/choose). Never include passwords, live user prompts or private data in the report.
