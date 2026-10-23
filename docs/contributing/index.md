# Help improve Bearing

**You don't need to write code or use GitHub.** Bearing depends on people spotting incorrect information, testing recommendations, challenging assumptions and contributing better evidence.

## Choose your route

### I don't want to code

1. **Correct a model fact.** Found an outdated price, missing capability, wrong context length or retired model? [Use the website form](https://findbearing.org/contribute).
2. **Question a recommendation.** Explain the job, what Bearing suggested and why it seemed wrong. Use a *synthetic or redacted* example, not a private prompt.
3. **Challenge the methodology.** Think a scoring factor, weighting or evidence source is misleading? [Read the challenge guide](methodology.md) and share your reasoning.
4. **Improve accessibility or clarity.** Report what was confusing through the [website form](https://findbearing.org/contribute).

**A short explanation is sufficient.** Links to dated provider information or reproducible examples are helpful, but you don't need to know the data schema. You can submit the [website form](https://findbearing.org/contribute) without a GitHub account. Reports are moderated and cannot directly change model facts. Technical contributors can still use GitHub.

### I want to contribute technically

- **Code, tests or documentation:** follow [CONTRIBUTING.md](https://github.com/tomcwxyz/bearing/blob/master/CONTRIBUTING.md).
- **Model evidence:** raise an evidence issue first. The checked-in registry is generated from canonical data; editing it directly is not a reliable correction route.
- **Database or schema changes:** use the [safe database contribution guide](../database-contributions.md) and [schema-change guide](../architecture/schema-changes.md).
- **Scoring methodology:** see [how models are rated](../model-ratings.md) and [challenge the methodology](methodology.md).

You can run code checks without production keys or Neon. Migration tests use disposable PostgreSQL rather than a shared database.

The planned local contributor workbench is in [PR #122](https://github.com/tomcwxyz/bearing/pull/122), and reviewed, auditable model corrections are in [PR #132](https://github.com/tomcwxyz/bearing/pull/132). **Neither is part of the default branch yet.**

## What makes good evidence?

Tell us **which model or model variant**, what is incorrect, what you expected, and how you know. Provide a source, date and any uncertainty. Where rankings are concerned, say what task and constraints you used.

Please don't submit private prompts, user records, production data, credentials or material you cannot share. A clearly described disagreement is valuable even if we do not immediately change a score.

Maintainers review contributions before modifying canonical data or production systems. Read the [public data model](../public-data.md) to understand what is published and under which constraints.
