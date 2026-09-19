# How Bearing works

Bearing is built around one loop:

> **Infer → recommend → run → challenge → learn**

The product is designed to make a useful default judgement first, while keeping the reasoning and evidence inspectable for people who want to go deeper.

## 1. Describe the job

The starting point is the work, not the model.

A task description is classified into structured attributes such as task type, complexity, input and output length, capability requirements, privacy sensitivity, latency target, recurrence and whether a multi-stage pipeline would be useful.

The classifier is allowed to ask follow-up questions when the description is genuinely ambiguous. Clear tasks should not be slowed down by compulsory questionnaires.

Classifier output is validated against the canonical runtime schema before it becomes application state. If a model returns invalid structured output, Bearing can make one repair attempt and then validates the result again. The validator is not bypassed to make malformed output fit.

## 2. Take a bearing

Bearing turns the structured task into two kinds of decision input:

### Hard requirements

Some things are gates, not preferences. Examples include:

- the task requires vision;
- the task requires tools or code execution support;
- data must remain on-premise;
- the workload belongs to the embedding model class rather than chat models.

A candidate that cannot satisfy a hard requirement should not survive simply because it is cheap or strong on another factor.

### Weighted priorities

For candidates that satisfy the hard constraints, Bearing ranks across seven broad factors:

- quality;
- capability;
- cost;
- speed;
- privacy;
- sustainability;
- transparency.

The normal flow infers a priority order automatically from the task. **Adjust bearing** lets a person inspect and change that order when they want explicit control.

Account-level learned preferences can gently nudge the default order for owned tasks, but they cannot override hard requirements or explicit task-specific choices.

## 3. Rank candidates

Each candidate gets a task-relative score. The score is used to order models; it is not a probability that the model will succeed.

That distinction matters. A weighted score of `0.82` does **not** mean “82% likely to work”, and Bearing deliberately avoids presenting ranking scores as match percentages.

Capability is task-relative too. A model does not receive extra credit merely for having more features. Required capabilities are gates, useful optional capabilities can add limited value, and irrelevant breadth is neutral.

## 4. Separate ranking from evidence confidence

Bearing also calculates a recommendation-confidence signal. This answers a different question:

> How strong and internally consistent is the evidence behind this recommendation?

Confidence can use signals including:

- classifier confidence;
- separation between the top candidates;
- catalogue freshness;
- disagreement between curated and benchmark evidence;
- supported human outcome evidence.

Confidence is still **not** an answer-correctness probability. It is a statement about the recommendation evidence.

## 5. Show one recommendation and meaningful alternatives

The results page is recommendation-shaped rather than leaderboard-shaped.

Bearing highlights a best-fit route and then chooses alternatives that expose useful trade-offs — for example provider diversity, cost differences, local versus hosted execution, different evidence profiles or another strong candidate with genuine uncertainty around the ordering.

This is intentionally different from blindly showing ranks two and three.

## 6. Pipelines

Some jobs are better understood as several stages rather than one model call.

When the classifier identifies a useful multi-stage task, Bearing can score a pipeline in which different models handle different stages. A pipeline recommendation is an alternative route, not a claim that multi-model orchestration is always better.

The top-level task type remains one canonical task type even when a pipeline is recommended; the stages carry the more specific sub-work.

## 7. Run the real task

A recommendation becomes more useful when it can be tested.

For runnable models, Bearing can execute the user's real prompt with optional supported attachments. Runtime routing uses the same task-to-scoring mapping as the recommendation system so execution does not silently use a second decision system.

The original recommendation rank is preserved when a model is run. If the user runs recommendation number three, Bearing records that it was number three rather than relabelling it as route rank one.

## 8. Trio and Challenger are experiments

### Trio

Trio keeps an anchor recommendation and selects additional candidates for **information value**, not merely adjacent rank.

Selection can consider signals such as:

- provider diversity;
- cost/profile trade-offs;
- hosted versus local execution;
- sparse human outcome evidence;
- benchmark uncertainty.

The point is to learn something from the comparison.

### Challenger

Challenger is contextual. It starts with an existing answer and chooses an informative alternative to critique material gaps, assumptions or errors and attempt an improved answer.

A blind judge can provide a separate machine verdict, while the user's own preference is stored separately. Machine judgement is not treated as human preference.

## 9. Learn from outcomes

Bearing can aggregate several forms of human evidence:

- whether a recommendation worked;
- failure reasons and optional feedback;
- pairwise comparison preferences;
- Trio preferences;
- Challenger preferences.

These signals can strengthen or weaken the evidence shown around recommendations. They do **not** currently rewrite production ranking automatically; outcome-driven ranking changes should wait for adequate support and calibration.

## 10. Freshness and routability

AI catalogues change quickly. Bearing tracks freshness separately from intrinsic model quality.

Catalogue verification can observe:

- current provider/OpenRouter availability;
- pricing;
- context limits;
- observable capabilities;
- provider/model identifiers.

Potential metadata drift is reviewed before it changes canonical model records.

Runtime routability is a separate operational signal. Bearing records whether a model endpoint was healthy, degraded or unavailable. A single failure is not enough to suppress a model, and degraded status is not treated as intrinsic capability evidence.

The current conservative policy requires repeated, recent explicit `unavailable` observations before a model could qualify for blocking. That guard exists and is tested, but production recommendations and execution are not yet hard-filtered by it while more unattended evidence is collected.

## 11. Benchmarks and curated evidence

Bearing has curated task-fitness scores and can ingest external benchmark evidence. Disagreement is surfaced as uncertainty rather than hidden.

The benchmark blend path is intentionally controlled. Production ranking currently defaults to curated-only weighting (`BENCHMARK_BLEND=0`) while benchmark evidence is used for inspection, uncertainty and shadow evaluation. A non-zero production blend should be justified by repeated evidence, not by the mere availability of benchmark data.

See [How we rate models](model-ratings.md) for the detailed methodology.

## 12. Evaluation before rollout

Bearing uses two complementary evaluation layers.

### Golden ranking corpus

A versioned deterministic task corpus is used in CI to catch ranking regressions. Candidate ranking changes can also be replayed in shadow mode against an approved baseline before they affect production.

### Live classifier evaluation

A live semantic evaluation harness runs the real production classifier against golden descriptions plus focused ambiguity and pipeline probes. It reports field accuracy, task-type accuracy, clarification accuracy, pipeline detection, call failures and average model-reported confidence.

The first production baseline on **16 September 2026** covered 28 cases:

- 26 completed calls;
- 80.7% checked-field accuracy;
- 83.3% task-type accuracy;
- 96.2% clarification accuracy;
- average classifier-reported confidence of 0.84.

Two pipeline calls failed structured validation in that first run. A focused diagnostic showed one was transient and one returned an invalid top-level task type. The classifier was then tightened with an explicit canonical task-type rule plus one validation-triggered repair attempt.

These metrics are evidence for review, not automatic release thresholds yet. Individual field disagreements may also reveal that a golden expectation should change rather than that the classifier is wrong.

## 13. Open and local execution

Open weights, local execution and hosted availability are separate claims.

Bearing can filter results to models with strong open-weight evidence and,
separately, to models with reviewed local quantisation/runtime evidence.
Downloadable weights alone are not enough to label a model local-capable.

A person can optionally check a device in the browser. Bearing uses lightweight
WebGPU/browser hints plus a confirmed memory amount to estimate a conservative
model budget. A fresh device check changes the recommendation view: Bearing
keeps the original task ranking, filters it to models likely to run on that
machine, labels the highest eligible option **Best on this device**, and keeps
its original overall rank visible.

In the overall view, local-capable recommendations are annotated as **Runs on
this device** or **Local, not on this device**. When a model does not fit,
Bearing exposes the smallest reviewed local runtime requirement rather than
merely saying it is "too large". Browser API limits are not treated as physical
VRAM, and the default check does not intentionally fill GPU memory.

Predicted hardware fit is still only an estimate. Actual local execution
evidence — for example a model/quant/context observed through Ollama — belongs
in a separate execution-observation layer.

## 14. Public decision data

Bearing's open data model follows the same decision loop:

> **recommendation → choice → execution → outcome**

New choices can snapshot whether the selected model was open-weight and
local-capable, which open/local/hardware-fit filters were active, and a coarse
hardware profile where the person used the device-fit feature.

The hardware record deliberately excludes browser user-agent strings, IP
addresses and detailed GPU model descriptions. Observed execution is stored
separately from predicted fit so downstream analysis can distinguish “Bearing
thought this would fit” from “this model actually ran here”.

See [Public Data Model](public-data.md).

## 15. Privacy and continuity

Bearing does not need to retain raw task descriptions to provide most continuity.

Signed-in tasks can be owned by an account and listed in **My bearings**. Preference learning is inspectable, can be disabled, and can be reset. Raw prompts and responses used in experiments are represented by hashes in persistence where the product does not need their contents later.

Anonymous recommendation use remains supported.

## 16. Architecture

The application is organised so the web interface is not the only place the decision logic can live.

Product capabilities sit under `src/features/`, including bearing, recommendations, comparisons, runs, validation, feedback and authentication. Database access is split by aggregate under `src/db/` rather than one shared persistence monolith.

The former `src/app/actions.ts` and `src/lib/db.ts` monoliths have been removed. Services such as recommendation results and canonical task-to-scoring mapping are reused across pages and execution paths.

That structure is intentional preparation for a future reusable decision-layer interface, where another tool could ask Bearing for a route without recreating the ranking logic.

## What Bearing does not claim

Bearing does not claim that:

- one model is universally best;
- a ranking score is a calibrated probability;
- a benchmark automatically represents real-world usefulness;
- a temporary endpoint outage means a model is low quality;
- a blind judge is a substitute for human preference;
- learned preferences should override the needs of the current task.

The aim is a practical, inspectable decision under uncertainty — and a system that can improve as better evidence arrives.
