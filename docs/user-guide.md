# User Guide

Bearing helps you choose, test and learn about AI routes for real work. The normal experience is deliberately simple: describe the job, let Bearing take a bearing automatically, then inspect or test the recommendation.

## Getting a recommendation

### 1. Describe the job

On the home page, describe what you are trying to achieve. You do not need to name a model or manually choose a mode first.

Specific descriptions help. For example:

> Summarise a 60-page research report into a two-page briefing for a charity board, preserving important caveats and statistics.

is more useful than:

> Help with a document.

Bearing extracts structured information about the task, such as task type, complexity, input size, required capabilities, privacy needs and likely output size.

### 2. Clarify only when needed

If the description leaves an important decision genuinely unclear, Bearing asks a small number of focused follow-up questions.

If the description is already clear enough, this step is skipped.

### 3. Bearing works out the priorities

You no longer have to rank seven factors before seeing a recommendation. Bearing derives a sensible priority order from the task and applies hard requirements automatically.

The factors are:

- **Quality** — likely task performance;
- **Capability** — required or useful features such as vision, tools, code or long context;
- **Cost** — estimated relative spend;
- **Speed** — response-time performance;
- **Privacy** — data handling and deployment constraints;
- **Sustainability** — available evidence about environmental footprint;
- **Transparency** — openness of weights, methodology, data and provider disclosure.

If you want to change the inferred weighting, use **Adjust bearing**. That is an advanced control rather than a required step.

### 4. Read the result

The results page is organised around one recommended route, not a leaderboard.

You will normally see:

- the **best-fit recommendation**;
- a concise explanation of why it fits;
- factor and evidence detail you can inspect;
- **meaningful alternatives** chosen because they represent useful trade-offs;
- estimated task cost where available;
- recommendation confidence where there is enough evidence to calculate it.

Bearing does **not** show a “match percentage”. Its weighted score is internal ranking machinery, not a calibrated probability that the model will succeed.

### Meaningful alternatives

Alternatives are not simply ranks two and three. Bearing tries to surface candidates that teach you something useful about the decision — for example a lower-cost option, a different provider, a local model, or a strong candidate where the evidence is less certain.

### Pipeline recommendations

If the task naturally contains several different stages, Bearing may suggest a multi-stage pipeline as an alternative to one model doing everything.

For example, a workflow could involve extracting information, analysing it, then writing a final briefing. Different stages can be scored independently and routed to specialist models.

A pipeline is suggested when it appears useful; it is not assumed to be better by default.

## Running a recommendation

Where a recommended model is runnable, choose **Run this prompt**.

Enter the real prompt you want to test and, where supported, attach a file. Bearing runs the selected route and shows the result alongside practical information such as model identity, estimated cost and latency.

Running requires sign-in because it incurs API cost and has daily allowances.

Bearing preserves the recommendation rank of the model you chose. Running the third recommendation does not silently relabel it as “rank one”.

## Trio

Trio is useful when a single recommendation is not enough and comparing answers could reduce uncertainty.

It keeps an anchor model and chooses additional candidates for **information value**. Those alternatives can differ by provider, cost profile, local/hosted status, benchmark uncertainty or the amount of human outcome evidence available.

The aim is not “top three models at once”. It is a small experiment that can tell you something useful.

After the outputs return, a blind judge can provide a machine verdict and you can record the answer **you** preferred. Those are kept as different signals.

## Challenger

Challenger starts from an existing answer.

Bearing selects an informative alternative model and asks it to identify material gaps, errors or assumptions in the first answer and then attempt an improved response.

A blind judge can compare the two outputs, but your own preference remains the human outcome signal.

Challenger is most useful after you already have an answer and want to test whether another model exposes something important.

## Comparing two models directly

If you already know which two models you want to compare, use **Compare**.

Both models receive the same prompt and supported attachment. Their outputs are shown side by side and you can record which you preferred, or that they were about the same.

Direct Compare is intentionally different from Trio: you choose the models yourself rather than asking Bearing to select an informative set.

## Validating a model you already use

Use **Validate** when you already have a model and want to see how it fits a particular job.

Choose the model, describe the task, and Bearing scores the task using the same underlying task-to-scoring mapping as normal recommendations.

The result explains where your current model sits relative to the alternatives. Treat labels such as “good fit” or “better options” as task-relative assessments, not universal statements about the model.

## Embedding models

Bearing recognises embedding work through the normal task flow. You can describe a retrieval, semantic-search, RAG, clustering or similarity task without first choosing a special mode.

There is also a guided embedding finder for people who want to specify things such as:

- retrieval versus similarity use case;
- typical text length;
- hosted versus open/self-hosted deployment;
- language coverage;
- latency needs.

Embedding models are kept separate from chat models in ranking because they solve a different kind of job.

## Browsing the model registry

The **Models** area lets you inspect the currently active registry rather than relying on a fixed model count in the documentation.

Model pages can include:

- provider and model class;
- pricing;
- context window;
- capabilities;
- strengths and weaknesses;
- task-fitness evidence;
- transparency information;
- sustainability information;
- embedding-specific details where relevant.

Because model catalogues change, Bearing also tracks freshness and provider identifiers separately from the model's intrinsic scores.

## Freshness and availability

A model can be a strong fit but temporarily unavailable. Bearing treats these as different questions.

Catalogue verification checks current provider/OpenRouter evidence such as pricing, context size, capabilities and identifiers. Potential drift is reviewed before canonical model metadata is changed.

Runtime canaries separately observe whether model endpoints are healthy, degraded or unavailable. A single runtime failure is not treated as evidence that the model is poor, and production ranking is not currently hard-filtered from one or two observations while the policy is still being calibrated.

## Signing in and My bearings

The core recommendation journey can be used anonymously.

Sign-in is required for features that incur execution cost or need account continuity, such as Run, Trio, Challenger and direct comparisons.

Bearing uses email and password authentication, with password setup/reset by email where needed.

When signed in, completed owned bearings can appear in **My bearings**. Bearing can provide this continuity without storing the raw task description: task ownership is attached to the structured task record instead.

## Learned preferences

For signed-in users, Bearing can learn gentle preferences from repeated human choices.

These preferences are:

- separate from explicit task priorities;
- inspectable;
- disableable;
- resettable;
- unable to override hard requirements for the current job.

The goal is to remove repeated friction, not to lock a person into past behaviour.

## Feedback and learning

Human evidence is one of the most useful ways Bearing can improve.

Signals can include:

- whether a recommendation worked;
- why it failed when it did not;
- pairwise comparison preferences;
- Trio preferences;
- Challenger preferences.

These signals can contribute to recommendation confidence and evidence summaries. They do not currently rewrite production rankings automatically; that requires enough support and calibration first.

## Privacy

Bearing is designed to learn from structured evidence without retaining raw work by default.

Depending on the feature, persistence can include:

- structured task attributes;
- task ownership;
- recommendation ranks and factor scores;
- model selections;
- outcome categories;
- pairwise preferences;
- hashes of prompts and responses rather than their text.

Raw task descriptions are not retained simply to power My bearings.

## Understanding the methodology

For the product and architecture model, see [How Bearing works](how-bearing-works.md).

For detailed scoring, benchmark, transparency and sustainability methodology, see [How we rate models](model-ratings.md).

The important distinction is:

- **ranking score** orders candidates;
- **recommendation confidence** describes the strength of the evidence behind that ordering;
- neither is a probability that an answer will be correct.

## Admin and maintenance

Administrators have additional tools for maintaining the registry and evidence system, including:

- adding, editing and deactivating models;
- managing provider and OpenRouter identifiers;
- reviewing catalogue drift before applying changes;
- checking freshness;
- running catalogue, EcoLogits and routability maintenance;
- inspecting benchmark aliases and ingestion;
- reviewing usage and outcome aggregates.

Model freshness and operational routability are deliberately kept separate from task-quality scoring so maintenance events do not silently become claims about model capability.
