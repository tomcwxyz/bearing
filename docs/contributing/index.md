# Contribute to Bearing

The code is open, but so are the *questions behind the code*. Bearing benefits from contributors who test our assumptions, correct evidence, improve experience or suggest better data structures. You should not have to request access to a maintained database to participate.

For commands, PR steps and licence guidance, read [CONTRIBUTING.md](https://github.com/tomcwxyz/bearing/blob/master/CONTRIBUTING.md).

## Pick the contribution that fits

| Contribution | Example | How to start |
| --- | --- | --- |
| **Evidence** | A benchmark refers to a reasoning variant, not the base model | [Model or evidence issue](https://github.com/tomcwxyz/bearing/issues/new/choose) |
| **Methodology** | A capability gate excludes a plausible candidate | [Challenge the methodology](methodology.md) |
| **Data model** | Deployment route and evaluated model variant need separate identities | [Propose a schema change](../architecture/schema-changes.md) |
| **Code / tests** | Add a regression case to the deterministic scoring engine | Fork and make a PR |
| **Design / documentation** | Explain a decision or simplify a confusing screen | Issue or small PR |

A useful contribution may be a **careful question** backed by an example, not a finished answer.

## No Neon access? That's normal.

The repository includes scoring functions, tests, evaluation tasks, migration SQL and a generated model registry. Much of this can be inspected and checked without a database.

- **No environment setup:** participate in issues and proposals, or edit Markdown.
- **Local code checks:** `npm ci`, `npm test`, `npm run eval:ranking`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- **Full app or persistence work:** currently requires independently supplied database/provider configuration. A built-in fixture-backed app and automatic disposable-Postgres migration tests are *proposed future improvements*, not existing functionality.

The committed registry is a generated snapshot, and production maintains canonical model records in Neon. **Do not assume a pull request directly editing registry JSON will survive regeneration.** Use an evidence proposal with source, variant and date.

## Evidence should be inspectable

A proposed change is easier to review when it records:

- the problem and who it affects;
- the current behaviour, expected outcome and a reproducible example;
- what the evidence actually measures, its source, date and variant;
- uncertainty, competing explanations and possible harm;
- a proportionate way to evaluate whether the change helped.

Where the evidence is inconclusive, documenting the disagreement is a valid outcome. Not every challenge needs to become a score adjustment.

## Decisions, not just suggestions

For changes with lasting architectural or methodological effects, propose an [architecture decision record](../architecture/decisions/0000-template.md) in the PR once an issue has established the question. Distinguish a *proposal* from an accepted decision. Maintainers decide production changes, with rationale and outstanding uncertainty recorded in public.

## What we won't ask for

We do not need your production credentials, data exports, user messages, raw prompts, private outcomes or personally identifying data to reproduce an issue. Use synthetic examples, minimal samples and public evidence, observing licences attached to third-party benchmarks.

See also [How Bearing works](../how-bearing-works.md), [How we rate models](../model-ratings.md) and the [public data model](../public-data.md).
