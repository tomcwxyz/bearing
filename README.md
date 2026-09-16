# Bearing

**Take a bearing on the right AI route for the job.**

Describe what you are trying to do. Bearing infers what matters, recommends a model or route, lets you run it where possible, challenges uncertain answers with useful alternatives, and learns from what actually worked.

The product is deliberately more than a ranking page. It combines task classification, capability gates, transparent evidence, execution, comparisons and structured human outcomes into a reusable decision layer.

Built by [The Good Ship](https://good-ship.co.uk) · [tomcw.xyz](https://tomcw.xyz) · [MIT License](LICENSE)

## How Bearing works

The default journey is:

1. **Describe the job** — tell Bearing what you need to do.
2. **Clarify only when needed** — low-confidence classifications can ask short follow-up questions.
3. **Take a bearing automatically** — priorities are inferred from the task, constraints and any inspectable user preferences.
4. **Recommend one route** — one best fit plus meaningful trade-off alternatives.
5. **Run it** — execute the real prompt on a runnable recommendation.
6. **Challenge uncertainty** — use Trio or Challenger when another model could teach us something useful.
7. **Learn** — record human preference and outcomes as structured evidence.

If you want more control, **Adjust bearing** exposes the underlying seven-factor priority order and exclusions.

## Product principles

- **Recommendation before configuration.** A normal task should not require manual factor sorting.
- **A bearing is a reasoned route, not a percentage.** Weighted scores are ranking machinery, not calibrated probabilities of success.
- **Execution closes the loop.** Real task outcomes are stronger evidence than editorial assumptions alone.
- **Uncertainty should trigger an experiment.** Trio and Challenger are designed to be informative, not simply additional modes.
- **Freshness is part of correctness.** Catalogue metadata and runtime availability are checked separately and continuously.
- **Privacy is structural.** Raw task descriptions and prompts are not retained as the price of learning.

## Main capabilities

### Recommend

Describe a task and Bearing classifies it, applies hard capability constraints, infers a bearing and presents:

- **Best fit** — the primary recommendation;
- **trade-off alternatives** — meaningfully cheaper, different-provider, local/private or otherwise distinct options where relevant;
- **decision confidence** — evidence strength, not answer-correctness probability;
- **Why this model?** — inspectable factor, freshness, benchmark and outcome evidence.

### Run, Trio and Challenger

From a recommendation card you can run your actual prompt on that model.

- **Run this model** executes the selected recommendation, including lower-ranked alternatives when you explicitly choose them.
- **Trio** keeps your selected model as the anchor and chooses up to two credible alternatives for information value — for example provider diversity, cost trade-offs, local-vs-hosted differences, outcome-evidence scarcity or benchmark uncertainty.
- **Challenger** appears after a successful answer and asks an informative alternative to identify material gaps and produce an improved answer if it can.

Blind-judge results and human preferences are stored separately. Routed-run records retain hashes and structured metadata rather than raw prompts/responses.

### Compare

Compare any two runnable models with the same prompt, including optional PDF/CSV attachments. You can enter Compare directly or from an existing bearing. Human preference is recorded as pairwise outcome evidence.

### Validate

Name a model you already use and describe the job. Bearing shows where it sits relative to the task-specific ranking and whether stronger alternatives exist, without presenting the weighted score as a fake match probability.

### Embeddings

Embedding models are a first-class model class. Embedding tasks route separately from chat tasks and expose relevant evidence such as:

- MTEB-oriented quality;
- embedding dimensions;
- maximum input length;
- Matryoshka support;
- input-token pricing;
- hosted/open execution characteristics.

A dedicated guided finder is available at `/embedding`.

### Local inference

Open-weight recommendations can include local hardware guidance, quantisation options and estimated VRAM requirements for consumer through server-class hardware.

### Pipelines

When the classifier identifies a multi-stage task, Bearing can recommend specialist models per stage instead of assuming one model should do everything.

## How ranking works

Models are considered across seven factors:

| Factor | What it represents |
| --- | --- |
| **Quality** | Task-relative fitness informed by curated and external evidence |
| **Capability** | Required and contextually useful features |
| **Cost** | Estimated cost for the task shape |
| **Speed** | Expected response latency |
| **Privacy** | Data handling and deployment characteristics |
| **Sustainability** | Inference/provider environmental evidence |
| **Transparency** | Openness of weights, methods, data and provider disclosure |

Required capabilities are hard gates. Optional capability breadth only helps when it is relevant to the task.

Priority order is converted to weights, then adjusted by task context such as complexity, sensitivity, latency and volume. Users can override or exclude factors through **Adjust bearing**.

External benchmark evidence can be blended behind the `BENCHMARK_BLEND` rollout ceiling. Production remains curated-first until shadow/live evidence supports changing that ceiling. Benchmark disagreement is surfaced as uncertainty rather than silently discarded.

The scoring engine is deterministic and tested. Larger ranking changes are evaluated against a versioned golden task corpus and approved shadow-ranking baseline in CI.

## Evidence and freshness

Bearing keeps several evidence types deliberately separate:

- **catalogue evidence** — is the model metadata current and verified?
- **runtime routability** — can the configured execution path currently run the model?
- **benchmark evidence** — what do relevant external measurements suggest?
- **human outcome evidence** — what did users actually prefer or report as successful?
- **blind-judge evidence** — what did an automated judge choose when model identities were hidden?

These signals are not interchangeable. In particular, a provider outage does not reduce a model's capability score.

### Scheduled maintenance

Production maintenance currently runs through authenticated Vercel cron jobs:

- **03:00 UTC Monday** — EcoLogits refresh;
- **04:00 UTC Monday** — catalogue verification;
- **05:00 UTC daily** — runtime routability canary.

`CRON_SECRET` is required in production so Vercel can authenticate these endpoints.

The first authenticated production routability baseline completed on **2026-09-16** with 42 persisted observations: 40 healthy and 2 explicit unavailable observations. Routability remains observational; a conservative guard requires repeated recent explicit unavailability and is not yet wired into live model filtering. See [`docs/operations/2026-09-16-routability-baseline.md`](docs/operations/2026-09-16-routability-baseline.md).

## Outcomes and open data

Bearing collects structured evidence about AI work and model outcomes. Depending on the flow this can include:

- classified task attributes;
- inferred/adjusted priorities;
- recommendations and ranks;
- selections;
- explicit success/failure outcomes;
- pairwise preferences;
- Trio/Challenger candidates and selection rationale;
- blind-judge verdicts kept separate from human preference.

Raw task descriptions and prompts are not stored in the outcome dataset. Descriptions/prompts used for persistence are hashed where needed for linkage/deduplication.

## Accounts and continuity

Anonymous recommendation use remains supported. Signed-in users can additionally own/resume bearings, view **My bearings**, and use inspectable preference defaults.

Authentication uses **email + password**. Earlier passwordless accounts can use the password-setup/reset flow. Password reset/setup emails are sent through Resend.

## Architecture

Bearing is a Next.js application with product capabilities increasingly separated from UI transport:

```text
src/
├── app/                         # App Router pages + API routes
├── features/
│   ├── auth/                    # Account/password actions
│   ├── bearing/                 # Submission, clarification, embedding preparation
│   ├── comparisons/             # Pairwise comparison execution/preferences
│   ├── feedback/                # Recommendation selections + outcomes
│   ├── recommendations/         # Scoring input + recommendation service
│   ├── runs/                    # Route, Trio, Challenger
│   └── validation/              # Validation submission/results
├── db/                          # Aggregate-specific repositories (in progress)
├── lib/                         # Scoring, classification, evidence and shared domain logic
├── data/                        # Generated model registry
└── prompts/                     # LLM task/reasoning prompts
```

`src/app/actions.ts` is now primarily a legacy compatibility surface being decomposed. New product logic should live under the appropriate feature/service rather than extending that monolith.

Database access is also moving from `lib/db.ts` into aggregate-specific repositories under `src/db/`.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js App Router + TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Neon Postgres (`@neondatabase/serverless`) |
| Classification/reasoning | Anthropic SDK |
| Execution | OpenRouter plus supported direct-provider adapters |
| Benchmarks/evidence | LMArena, LiveBench, Artificial Analysis, MTEB and curated evidence |
| Carbon grounding | EcoLogits where supported |
| Auth | Auth.js credentials + email/password |
| Email | Resend |
| Hosting | Vercel |

## Getting started

```bash
git clone https://github.com/tomcwxyz/bearing.git
cd bearing
npm install
cp .env.local.example .env.local
```

Configure the required environment variables described in `.env.local.example`, then run migrations and seed/model sync appropriate to your environment.

```bash
npm run dev
```

For production, ensure `CRON_SECRET` is configured alongside the application/database/provider credentials so scheduled maintenance fails closed rather than running unauthenticated.

## Testing and CI

The repository CI workflow runs:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run eval:golden
npm run build
```

Recent changes are merged only after this full verification job succeeds. GitHub branch protection is not yet technically enforcing the check because the current connected integration does not have branch-protection administration access.

## Methodology

Detailed model-rating methodology lives in [`docs/model-ratings.md`](docs/model-ratings.md). The current direction is to make provenance, freshness, disagreement and evidence support explicit rather than imply precision that the underlying evidence cannot justify.

## Roadmap

See [`docs/plans/2026-09-13-bearing-1-reorientation.md`](docs/plans/2026-09-13-bearing-1-reorientation.md) for the current Bearing 1.0 roadmap.

## Contributing

The scoring engine, model evidence and policies are intentionally inspectable. Contributions are welcome, especially where they improve model freshness, evidence provenance, evaluation coverage or transparent decision logic.

## Licence

[MIT](LICENSE)
