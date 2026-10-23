# Bearing

**Find the right AI model for the job.**

[Bearing](https://findbearing.org) helps you choose an AI model based on the work you want to do, rather than a generic leaderboard. Describe your task, get an evidence-informed recommendation and useful alternatives, and test them where supported.

Built by [The Good Ship](https://good-ship.co.uk). Open-source software under the [MIT licence](LICENSE).

## What can Bearing do?

- **Recommend:** match models to a task, constraints and priorities such as quality, cost, privacy and sustainability.
- **Explain:** show the reasoning, available evidence and important uncertainties behind a recommendation.
- **Try and compare:** run supported models, compare responses, and use Trio or Challenger to explore alternatives.
- **Explore:** browse model information, embedding models, and options for running AI locally.
- **Learn:** use structured outcome feedback without retaining raw prompts by default.

Scores are tools for *ranking*, not percentages predicting success. Model capabilities, availability, benchmark evidence and user outcomes are treated separately.

**[Try Bearing](https://findbearing.org)** · **[Read the documentation](https://docs.findbearing.org)**

## Help improve Bearing

You don't need to be a developer. Contributions to **model facts, evidence, scoring decisions, design, documentation and code** are welcome.

| I want to… | Start here |
| --- | --- |
| Flag an incorrect model price, capability or fact | [Suggest a correction on GitHub](https://github.com/tomcwxyz/bearing/issues/new/choose) |
| Question a recommendation or scoring method | [Challenge the methodology](docs/contributing/methodology.md) |
| Improve code or documentation | [Contributor guide](CONTRIBUTING.md) |
| Understand the public evidence and data | [Public data model](docs/public-data.md) |

If you aren't technical, **opening an issue with a description and source is enough**. There is no need to edit JSON, run the application or access the database. A simple [website contribution form](https://findbearing.org/contribute) is available for people who prefer not to use GitHub. All reports are moderated.

For developers, see [CONTRIBUTING.md](CONTRIBUTING.md) and the [contribution routes](docs/contributing/index.md). Developers can run the [offline contributor workbench](docs/local-workbench.md) using `npm run dev:demo`. [Reviewed evidence proposals](docs/model-evidence-contributions.md) are available through GitHub pull requests and maintainer review; the website-native feedback form is available at [Contribute](https://findbearing.org/contribute).

## Developer quick start

Use Node.js 22 and npm.

```bash
git clone https://github.com/tomcwxyz/bearing.git
cd bearing
npm ci
npm test
npm run dev
```

Running the full application requires your own environment configuration; see [`.env.local.example`](.env.local.example). You can contribute to tests, scoring and documentation without production credentials. The application is **not yet fully usable offline**.

For routine checks:

```bash
npx tsc --noEmit
npm run lint
npm run eval:golden
npm run build
```

Database migrations can be tested in a disposable local PostgreSQL container with `npm run db:test:migrations` (Docker required). **Do not run database migrations or seed scripts against production.** The existing production schema/migration-ledger discrepancy requires the [documented reconciliation procedure](docs/operations/migration-reconciliation-2026-10-13.md).

## Learn more

- [How Bearing works](docs/how-bearing-works.md)
- [How models are rated](docs/model-ratings.md)
- [User guide](docs/user-guide.md)
- [Architecture and data model](docs/architecture/data-model.md)
- [Operations and catalogue confidence](docs/operations/catalogue-confidence-2026-10-13.md)

Code: [MIT](LICENSE). Model and third-party evidence may have **different reuse licences**; see [contribution guidance](CONTRIBUTING.md).
