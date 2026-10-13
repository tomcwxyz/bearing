# Challenge the methodology

**How Bearing reaches a recommendation is open to scrutiny.** Challenges to weights, task classifications, evidence, benchmark mappings, claims about openness, environmental evidence or evaluation design are welcome. You do not need to write code, agree with current assumptions or have access to production data.

Begin with a [methodology challenge issue](https://github.com/tomcwxyz/bearing/issues/new/choose).

## What is worth challenging?

Bearing's [seven-factor methodology](../model-ratings.md) makes some explicit choices:

- The system classifies a task and applies hard capability requirements.
- It ranks eligible models with task-relative factors; these weighted scores are **not** success probabilities.
- Curated task fitness and external benchmark observations remain distinguishable.
- Model identity and evaluation variant must be resolved before benchmark scores are compared.
- Model quality, provider routability, catalogue freshness and human preferences represent **different kinds of evidence**.
- Outcomes are not automatically allowed to rewrite production rankings.
- A recommendation can be useful while its supporting evidence remains uncertain.

Any of those choices could be improved. We particularly welcome missing perspectives: for example, people doing multilingual, accessibility-related, privacy-sensitive or constrained-hardware work.

## A good challenge has a testable question

Consider this example:

> **Claim:** For a short, low-risk extraction task, the current quality-weighting seems to favour a slow, expensive frontier model over a reliably capable cheaper one.
>
> **Evidence:** Two named model variants, dated provider prices and a small, shareable synthetic task corpus.
>
> **Alternative:** Keep accuracy and schema adherence as gates, then emphasise cost and latency once they pass.
>
> **What would change our minds:** Replaying the proposal on existing golden tasks, checking extraction accuracy and measuring changes on difficult cases.

That question is valuable even if the proposed alternative turns out to be wrong.

## Include the evidence *and its limitations*

1. **Which decision or claim?** Link the relevant documentation or code and provide a concrete task context.
2. **What evidence?** Include dates, exact model and evaluation variants, test conditions, published sources, sample size or measurement method.
3. **Could there be another explanation?** Consider different prompts, settings, deployment routes, cohorts, data age or licence restrictions.
4. **What is the consequence?** Who benefits, who loses and which tasks would change?
5. **How would we evaluate it?** Suggest a regression test, a comparison, a change to the golden corpus or an explicit research question.

No confidential prompts or personal records should be attached. Use reproducible public or synthetic examples and respect dataset usage conditions.

## What happens to the challenge?

1. **Discuss:** Contributors and maintainers clarify the hypothesis and sources in a public issue.
2. **Investigate:** Reproduce where practical; compare against current methods and record disagreements and missing evidence.
3. **Decide:** Accept, reject, defer or mark inconclusive, with reasons. Significant changes can get a [decision record](../architecture/decisions/0000-template.md).
4. **Validate before rollout:** If implementation follows, tests and shadow/golden ranking evaluation must accompany it. Where deployed rankings could change, stage and review the effect before changing production configuration.

This is the **proposed review process**, not a claim that an automated review or moderation system already exists. Maintainers retain responsibility for changes to production evidence and scoring.

## Protect against false precision

- Do not equate a normalised score with a success probability.
- A benchmark may assess something narrower than a user's task.
- An evaluation of a reasoning or preview variant is not automatically evidence about its base model.
- Price and availability observations expire quickly; attach dates.
- Negative user feedback is valuable but may reflect execution conditions rather than model capability.
- Recording unresolved disagreement can be more honest than manufacturing a single corrected number.

The aim isn't to defend today's rankings. It is to make tomorrow's decisions easier to justify and to reverse when better evidence arrives.
