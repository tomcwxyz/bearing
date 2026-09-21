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
- **Filter for open-weight models** when openness matters to the job.
- **Find models with reviewed local-running evidence** rather than treating downloadable weights as proof that something will run locally.
- **Check your device** and see which local models are likely to fit, while keeping their original task ranking visible.
- **Verify local fit with Ollama** when you want to compare Bearing's estimate with an actual local runtime.
- **Resume previous bearings** when signed in, without Bearing needing to retain the raw task description.

## Scores are not probabilities

Bearing uses weighted scores to rank candidates. Those scores are **ranking machinery**, not calibrated probabilities of success, and Bearing does not present them as “87% match” or similar false precision.

Recommendation confidence is separate. It describes the strength and consistency of the evidence behind a recommendation: classification confidence, separation between leading candidates, catalogue freshness, benchmark disagreement and supported human outcome evidence can all contribute.

See [How Bearing works](how-bearing-works.md) and [How we rate models](model-ratings.md) for the details.

## Open, local and your device

"Open" and "runs locally" are not the same thing, so Bearing keeps them separate.

You can filter recommendations to models with strong **open-weight evidence**, and separately to models where Bearing has reviewed a real local runtime or quantisation route. Downloadable weights on their own are not enough for Bearing to claim that a model is practical to run locally.

If you want to know what will run on **your** machine, use the device check. Bearing uses lightweight browser information plus the memory amount you confirm to make a conservative estimate. After a fresh check, the results can switch to a device-aware view: the original task ranking stays intact, but models that are unlikely to fit are taken out of the way and the strongest remaining option is labelled **Best on this device**.

Where Ollama support has been reviewed, you can also run a small verification probe against your own local Ollama runtime. That is kept separate from your real task: Bearing does not automatically download a model and does not send your task text as part of the check.

## Freshness matters

AI models move quickly. A recommendation that made sense a few weeks ago can become wrong because the price changed, the context window moved, a provider dropped a model, or an endpoint simply stopped working.

Bearing checks for that rather than pretending the registry is timeless. We keep two things separate: **what a model is good at**, and **whether you can actually get to it today**. Catalogue changes are checked and reviewed before we update the model record; runtime availability is watched separately.

That separation matters. A temporary outage does not suddenly make a good model bad, and a great benchmark score is not much use if the model is no longer available.

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
