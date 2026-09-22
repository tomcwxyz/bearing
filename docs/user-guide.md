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

## Open and local models

Bearing treats **open weights**, **local capability** and **hosted availability** as different things.

That matters because a model can have downloadable weights without being realistic to run on an ordinary machine, and a model that can run locally may also be available through hosted providers.

On the results page you can use separate filters for:

- **Open models only** — models with strong reviewed evidence that weights are available;
- **Runs locally** — models where Bearing has reviewed a concrete local runtime or quantisation route;
- **Likely fits this device** — local-capable models that fit Bearing's conservative estimate for the device you have checked.

These filters do not quietly rewrite a model's intrinsic quality score. They narrow the route according to the constraint you care about.

### Checking your device

The device check is optional and happens in the browser.

Bearing uses lightweight browser/WebGPU hints plus a memory amount you confirm to estimate a conservative model-memory budget. Browser limits are not presented as if they were exact physical VRAM, and Bearing does not deliberately fill GPU memory just to find the breaking point.

After a fresh device check or memory confirmation, Bearing can switch to a device-aware result view:

- models unlikely to fit are taken out of the immediate recommendation list;
- the strongest eligible model is labelled **Best on this device**;
- its original overall task rank is still shown;
- local-capable models are labelled **Runs on this device** or **Local, not on this device**;
- where a model is too large, Bearing shows the smallest reviewed local memory requirement it knows about.

The point is to answer a practical question — *what is a good model for this job that I can actually run here?* — without pretending hardware fit is part of the model's intrinsic quality.

### Local Ollama and Ollama Cloud

Bearing treats local Ollama and Ollama Cloud as different execution routes.

For reviewed local models, Bearing can run a small verification probe against your own Ollama runtime. It checks models that are already installed, accepts compatible quantisation/instruction variants of the reviewed model, and does not auto-pull a large model. Embedding models use Ollama's embedding endpoint. If Bearing's memory estimate says a model is probably too large, you can still choose **Try in Ollama anyway** and turn a prediction into observed evidence.

For reviewed local chat recommendations, **Run locally** sends the real prompt directly from your browser to `localhost:11434`. The prompt and answer stay on the device; Bearing receives only coarse execution metrics such as runtime model, quantisation, throughput and timing.

**Ollama Cloud is hosted inference, not local execution.** Where Bearing has a reviewed Ollama Cloud route and the service is configured, the hosted run panel offers **Ollama Cloud** alongside Bearing's default hosted route. The prompt is sent from Bearing to Ollama's cloud API, and the result is labelled with that execution provider rather than being described as local.

Ollama Cloud prices are route-specific evidence. Bearing keeps them separate from the model's OpenRouter price and records the actual route/model identity in execution observations. Catalogue availability and runtime health are checked separately from intrinsic model quality.

## Running a recommendation

Where a recommended model is runnable, choose **Run this prompt**.

Enter the real prompt you want to test and, where supported, attach a file. Bearing runs the selected route and shows the result alongside practical information such as model identity, execution provider, estimated cost and latency. If a reviewed Ollama Cloud route exists, you can choose it explicitly instead of silently changing provider behind the scenes.

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

Models move. Prices change, context limits change, provider IDs move around, and sometimes a perfectly good model is simply unavailable for a while.

Bearing tries not to muddle those things together.

**Catalogue freshness** is about whether the facts we hold about a model are still current: pricing, context size, observable capabilities, provider identifiers and availability. When an external catalogue disagrees with Bearing, the difference is surfaced for review rather than silently overwriting the registry.

**Runtime availability** is about whether an endpoint can actually be reached. Bearing watches that separately with runtime canaries.

A failed endpoint check is not evidence that the model suddenly became worse at writing, coding or analysis. Equally, a strong model on paper is not much use for a route if it cannot currently be reached. Keeping those two kinds of evidence apart lets Bearing react to real change without overreacting to a temporary wobble.

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
