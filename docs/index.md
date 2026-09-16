# Bearing

**Take a bearing on the right AI route for the job.**

Bearing is a decision and evaluation layer for AI work. Describe what you are trying to do and Bearing takes a bearing automatically: it classifies the job, works out what matters, recommends a route, shows meaningful alternatives, and lets you test the recommendation on the real task.

The aim is not to tell you that one model is universally “best”. It is to help answer a more useful question: **what is the right route for this job, under these constraints, with the evidence we have?**

## The default journey

1. **Describe the job.** Tell Bearing what you are trying to achieve.
2. **Clarify only when necessary.** Clear tasks go straight through; ambiguous tasks get a small number of focused follow-up questions.
3. **Take a bearing automatically.** Bearing infers a priority order and applies hard requirements such as vision, tools, privacy or local execution.
4. **Get one recommendation and useful alternatives.** The main result is a recommended route, with alternatives chosen because they represent meaningful trade-offs rather than simply ranks two and three.
5. **Run the real task.** Where a model is runnable, you can test it from Bearing rather than carrying the recommendation elsewhere.
6. **Challenge uncertainty.** Trio and Challenger are experiments for cases where comparing outputs can teach you something useful.
7. **Learn from outcomes.** Human preferences and explicit outcomes become evidence for future recommendations.

If you want more control, **Adjust bearing** exposes the inferred priorities and exclusions without making configuration a compulsory step.

## What Bearing can do

- **Recommend a model or route** for a described task.
- **Suggest a multi-stage pipeline** when specialist models are a better fit for different stages.
- **Run a recommendation** with the real prompt and optional file attachment.
- **Use Trio** to compare an anchor recommendation with deliberately informative alternatives.
- **Use Challenger** to critique an existing answer with a useful alternative model.
- **Compare two models directly** on the same prompt.
- **Validate a model you already use** against the same task-relative scoring system.
- **Recommend embedding models** for retrieval, RAG, similarity and other vector workloads.
- **Browse the model registry** and inspect pricing, capability, transparency, sustainability and evidence.
- **Resume previous bearings** when signed in, without Bearing needing to retain the raw task description.

## Scores are not probabilities

Bearing uses weighted scores to rank candidates. Those scores are **ranking machinery**, not calibrated probabilities of success, and Bearing does not present them as “87% match” or similar false precision.

Recommendation confidence is separate. It describes the strength and consistency of the evidence behind a recommendation: classification confidence, separation between leading candidates, catalogue freshness, benchmark disagreement and supported human outcome evidence can all contribute.

See [How Bearing works](how-bearing-works.md) and [How we rate models](model-ratings.md) for the details.

## Freshness matters

Models, prices, capabilities and endpoints change. Bearing therefore treats freshness as part of correctness rather than as a maintenance detail.

The registry can be checked against provider catalogues and OpenRouter, runtime routability is observed separately, and catalogue drift is reviewed before changing canonical model metadata. Operational failures are kept separate from capability evidence: an endpoint outage is not evidence that a model is intrinsically worse.

## Learning without retaining the work

Bearing is designed to learn from structured evidence without retaining raw prompts by default. Depending on the feature, it can store task attributes, model choices, outcome signals, preference votes and hashes of prompts or responses rather than their text.

Signed-in users can have task ownership and inspect or reset learned bearing preferences. Anonymous use remains supported for the core recommendation flow.

## Open methodology

Bearing is intentionally inspectable. The documentation explains:

- how task classification and automatic bearing work;
- how hard requirements and weighted factors affect ranking;
- how benchmark evidence is used and where it is deliberately not yet allowed to change production ranking;
- how freshness, runtime routability and human outcomes are kept as distinct evidence types;
- how recommendation confidence differs from ranking score and answer correctness;
- how the classifier and ranking system are evaluated before changes are promoted.

## Built by

[The Good Ship](https://good-ship.co.uk) — open source project and open methodology.
