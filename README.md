# Bearing

**Find the right AI model for the work you want to do.**

[Bearing](https://findbearing.org) recommends models for real tasks, taking account of capabilities, quality, cost, privacy and other priorities. It explains its reasoning, shows alternatives, and lets you explore specialist pipelines and local options.

**[Try Bearing](https://findbearing.org)** · **[Documentation](https://docs.findbearing.org)** · **[Contribute without GitHub](https://findbearing.org/contribute)**

## Why Bearing?

AI model leaderboards tell you which models perform well on a benchmark. Bearing asks a different question: **which model fits this job?**

Recommendations combine task requirements, curated assessments and available evidence. They are **comparative judgements, not guaranteed outcomes**. Some catalogue facts remain unverified or subject to change; sources, uncertainty and [how models are rated](docs/model-ratings.md) are documented openly.

## Contribute

Corrections, evidence, challenges to the methodology, design improvements and code are welcome.

- **No coding or GitHub required:** [send feedback](https://findbearing.org/contribute).
- **Code, tests or documentation:** read [CONTRIBUTING.md](CONTRIBUTING.md).
- **Reviewed model evidence:** see the [proposal guide](docs/model-evidence-contributions.md).

To explore the scoring system offline, use Node.js 22:

```bash
git clone https://github.com/tomcwxyz/bearing.git
cd bearing
npm ci
npm run dev:demo
```

The full application reads its **live model catalogue from Neon on every request**. New recommendations, validation choices, execution routes and model pages use current database records, not a JSON bundle. It needs your own provider and database configuration; see [the example environment file](.env.local.example). Contributors should **never** use production credentials or production data. Migrations can be exercised with `npm run db:test:migrations` (Docker required).

## Licence and data

**Source code:** [MIT](LICENSE).

**Offline model snapshot:** `src/data/bearing-registry.json` is for offline tests, evaluations and explicit contributor demos. It is not the production catalogue and is no longer regenerated during application builds. An explicit `npm run db:generate` exports an updated snapshot when needed. Marked **CC BY-NC 4.0** in its metadata; it is **not** covered by the code's MIT licence. Some upstream evidence and benchmarks have separate licence and attribution requirements. Check provenance and reuse permissions before redistribution or commercial use. For details, see [contribution guidance](CONTRIBUTING.md) and [public data documentation](docs/public-data.md).

Built by [The Good Ship](https://good-ship.co.uk).
