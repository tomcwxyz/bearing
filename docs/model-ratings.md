# How We Rate Models

Bearing is a recommendation system, not a universal leaderboard. A model can be a strong choice for one job and a poor choice for another.

This page explains the evidence used to rank models, how that evidence is kept fresh, and the limits of what the scores mean.

**Last updated: 16 September 2026**

## The short version

Bearing works in layers:

1. **Classify the task** into structured requirements.
2. **Apply hard gates** for things the model must be able to do.
3. **Score the remaining candidates** across task-relative factors.
4. **Rank them** using the inferred or user-adjusted bearing.
5. **Estimate recommendation confidence** separately from the ranking score.
6. **Show meaningful alternatives** rather than only the next two ranks.
7. **Collect outcome evidence** from real use without automatically rewriting ranking from small samples.

A weighted model score is **not** a probability of success. Bearing deliberately does not present it as a match percentage.

## The seven factors

| Factor | What it represents |
| --- | --- |
| **Quality** | Evidence that the model performs well for this task type |
| **Capability** | Whether the model supports the capabilities this task needs |
| **Cost** | Estimated cost for the workload |
| **Speed** | Response-time performance where evidence is available |
| **Privacy** | Data handling, retention and deployment constraints |
| **Sustainability** | Available evidence about inference, training and provider infrastructure |
| **Transparency** | Openness of weights, methodology, data, licensing and provider disclosure |

The importance of these factors is task-relative. Bearing normally infers the order automatically; **Adjust bearing** lets a person override it.

## Hard requirements come first

Some task requirements are not meaningfully tradable.

Examples include:

- vision is required;
- tool use is required;
- code capability is required;
- data must stay on-premise;
- the job requires an embedding model rather than a chat model.

A candidate that cannot satisfy a hard requirement is excluded before weighted ranking. A cheap model does not compensate for being unable to do the job.

## Capability is task-relative

Bearing does not reward a model simply for having a long list of features.

Required capabilities act as gates. Optional capabilities can add limited value when they are relevant to the task. Unrelated capability breadth is neutral.

This avoids systematically favouring large general-purpose models for work that does not need their extra features.

## Task-fitness evidence

The quality component uses task-fitness evidence for canonical task types such as summarisation, extraction, generation, communications, code, mathematics, reasoning, analysis, research, question answering, translation, conversation and embedding work.

Bearing has two broad sources of task-fitness evidence:

### Curated evidence

Curated scores bootstrap the system where a clean benchmark signal is unavailable or incomplete. They are editorial judgements informed by published evidence, model documentation and observed capability.

They are not assumed to be permanent truth.

### External benchmark evidence

Bearing can ingest benchmark evidence and map source-side model names to canonical Bearing models.

Current sources include:

- **Artificial Analysis** — model evaluation, coding, mathematics and performance signals;
- **LMArena** — human preference ratings across several categories;
- **LiveBench** — contamination-resistant task benchmarks;
- **MTEB** — embedding-model quality evidence;
- **EcoLogits** — environmental evidence used for supported sustainability fields.

Source categories are mapped onto Bearing task types and normalised within the relevant source cohort.

## Benchmark evidence does not automatically control production ranking

External benchmarks are useful but imperfect. They can differ in task construction, cohort, model variant, recency and how closely they represent a user's real job.

Bearing therefore keeps benchmark evidence and curated evidence inspectable as separate signals.

The code supports evidence-weighted blending, but production ranking currently defaults to:

```text
BENCHMARK_BLEND=0
```

That means benchmark evidence can inform uncertainty, review and shadow evaluation without silently changing the live ranking.

A non-zero production blend should be justified by repeated evaluation evidence, not simply because benchmark data exists.

## Benchmark disagreement is evidence

When benchmark evidence and curated task fitness disagree, Bearing treats the disagreement as uncertainty.

It does not silently discard one source or force the two into agreement.

The breadth and recency of benchmark evidence can affect how much confidence we place in it. Large ranking changes can be replayed against the golden task corpus before any rollout.

## Model aliases and variants

Benchmark providers often name models differently, and the same model family can appear in several variants.

Bearing maintains aliases between external source names and canonical model slugs. The matching system can suggest likely aliases while flagging potentially important differences such as:

- reasoning versus non-reasoning variants;
- mini, nano or lite variants;
- vision-specific variants;
- distilled models;
- materially different generations or sizes.

Ambiguous mappings are reviewable rather than silently merged.

## Cost

Cost is estimated from the model's current pricing and the expected workload shape.

Input length, output length and pipeline stages can affect the estimate. Cost is a relative ranking factor, not a guarantee of the exact invoice from a provider.

Pricing is also freshness-sensitive and can be checked against live catalogues.

## Speed

Speed uses available performance evidence such as throughput or latency signals, supplemented by curated values where necessary.

Speed comparisons are particularly cohort-sensitive. A small distilled model and a frontier reasoning model may serve very different purposes, so a raw global speed rank is not automatically a useful task decision.

## Privacy

Privacy scores represent provider and deployment characteristics such as data retention, training use and whether local/on-premise execution is possible.

Some privacy requirements become hard gates. For example, if the task requires on-premise execution, a hosted-only model is excluded rather than merely receiving a lower privacy score.

Provider-level defaults can be refined by model-specific evidence.

## Transparency

Transparency is a composite evidence area that can include:

- open weights;
- openness or availability of training data;
- published methodology;
- licence openness;
- provider disclosure.

The aim is not to collapse “open” into a single binary label. A model may publish weights while still having a restrictive licence or limited methodology disclosure.

Provider profiles give Bearing a deterministic baseline. Family-specific rules can distinguish open-weight lines from closed products made by the same company.

## Sustainability

Sustainability evidence is kept in separate sub-dimensions where available, including:

- inference energy or carbon evidence;
- training-footprint evidence;
- provider infrastructure.

Null or unknown evidence is not treated as zero performance.

For supported models, EcoLogits can provide a more grounded inference signal than a purely editorial estimate. Bearing keeps provenance so the interface and admin tools can distinguish measured/derived evidence from curated values.

Sustainability is inherently incomplete and changes as deployment infrastructure changes, so it should be interpreted as available evidence rather than a precise life-cycle assessment.

## Freshness is separate from quality

A model's metadata can become stale even if its intrinsic capability has not changed.

Bearing tracks catalogue freshness through fields such as verification status, verification source and last verification time. Provider-native catalogue evidence is preferred for canonical model information where available, with OpenRouter also useful for routing coverage.

Potential drift in price, context window or observable capability is reviewed before being applied to the canonical registry.

## Runtime routability is a different evidence type

A model can be excellent for a task and temporarily impossible to call.

Bearing therefore stores operational routability separately from capability scoring.

Runtime canaries observe whether an endpoint is:

- healthy;
- degraded;
- unavailable.

The current conservative guard requires at least two consecutive recent explicit `unavailable` observations before a model can qualify as blocking evidence. A single failure, degraded response, stale observation or malformed record does not qualify.

This guard is implemented and tested, but runtime state remains observational in production while more unattended evidence is collected. An outage is never converted into a claim that the model has lower intrinsic quality.

## Recommendation confidence

Recommendation confidence is separate from the ranking score.

It can combine evidence such as:

- classifier confidence;
- separation between the top candidates;
- freshness of catalogue evidence;
- curated/benchmark disagreement;
- supported human outcome evidence.

Confidence describes how well-supported the recommendation is. It is **not** a calibrated probability that the eventual answer will be correct.

## Human outcome evidence

Bearing can learn from real decisions and outcomes, including:

- explicit recommendation success/failure;
- failure reason categories;
- pairwise comparison preferences;
- Trio preferences;
- Challenger preferences.

Blind-judge verdicts are stored separately from human preferences.

Outcome evidence can contribute to recommendation confidence where there is enough support. It does not currently alter the production ranking automatically; small samples should not overpower the rest of the evidence model.

## Meaningful alternatives

After ranking, Bearing does not simply present the next two rows of a leaderboard.

Alternatives are selected for useful trade-offs or information value. Depending on the task, that can include:

- provider diversity;
- lower cost;
- local versus hosted execution;
- a different capability/profile balance;
- sparse outcome evidence worth testing;
- benchmark uncertainty around two strong candidates.

This is why the visible result is recommendation-shaped rather than ranking-shaped.

## Evaluation

### Golden ranking corpus

A versioned golden task corpus is part of CI. It protects deterministic ranking behaviour from accidental regression.

Candidate ranking changes can also run in shadow mode against an approved baseline to show how many top recommendations would change and how severe those changes are.

### Live classifier evaluation

The task classifier has a separate live semantic evaluation harness that calls the real production classifier.

It covers golden task descriptions plus focused ambiguity and multi-stage pipeline probes and reports:

- checked-field accuracy;
- task-type accuracy;
- clarification accuracy;
- pipeline-detection accuracy;
- failed calls;
- average classifier-reported confidence.

The first production baseline on **16 September 2026** ran 28 cases, of which 26 completed successfully. It recorded:

- **80.7%** checked-field accuracy;
- **83.3%** task-type accuracy;
- **96.2%** clarification accuracy;
- **0.84** average classifier-reported confidence.

Two pipeline calls failed runtime validation on the first full run. Focused diagnostics showed the pipeline mechanism itself worked; one remaining case returned a non-canonical top-level task type. The classifier prompt was tightened and one schema-repair attempt was added for validation failures, while keeping the runtime validator authoritative.

These figures are a baseline for investigation, not a release score. Some field disagreements may indicate a stale or debatable golden expectation rather than a classifier defect.

## Provenance

Where practical, Bearing keeps track of where evidence came from. Common provenance classes include:

- benchmark or source-derived;
- deterministic provider/profile derived;
- curated;
- AI-assisted estimation where no grounded signal exists;
- operational observation;
- human outcome evidence.

Keeping these separate is important because they answer different questions and deserve different levels of trust.

## What the scores do not mean

Bearing scores do not mean:

- “this model is 87% likely to succeed”;
- “this benchmark proves this model is universally better”;
- “a temporarily unavailable endpoint is a low-quality model”;
- “the blind judge is more important than the person doing the work”;
- “past user preference should override current task requirements”.

The system is intended to make an inspectable decision under uncertainty and improve as better evidence accumulates.

For the end-to-end product and architecture flow, see [How Bearing works](how-bearing-works.md).
