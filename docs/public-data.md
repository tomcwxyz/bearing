# Public data model

Bearing publishes anonymised decision data so the recommendation system can be
inspected and improved using evidence from real tasks rather than benchmarks
alone.

The public model deliberately separates four stages:

> **recommendation → choice → execution → outcome**

That distinction is important. A model being recommended as suitable for local
hardware is not evidence that the person actually ran it locally.

## Public datasets

### Recommendation / decision dataset

Endpoints:

- `/api/dataset?format=json`
- `/api/dataset?format=csv`

Current schema: **2.1**.

Each record represents a task that reached the recommendation stage. It can
contain:

- the structured task classification;
- the priority order and factor weights actually used;
- the ranked model recommendations;
- current openness and local-capability metadata for those recommendations;
- any local-inference candidates;
- the model selected by the person, if any;
- a selection-time snapshot of that model's openness/local status;
- the filters and coarse hardware context active when the model was chosen;
- actual execution observations, when Bearing has evidence that an execution
  really occurred;
- optional outcome feedback.

### Comparison dataset

Endpoints:

- `/api/dataset/comparisons?format=json`
- `/api/dataset/comparisons?format=csv`

Current schema: **1.2**.

This contains direct head-to-head preferences. Model metadata includes current
open-weight, local-capability and model-class evidence. Historical comparison
rows did not snapshot that model metadata at comparison time, so it is labelled
as current-at-export evidence rather than historical state.

### Routed-run dataset

Endpoints:

- `/api/dataset/routed-runs?format=json`
- `/api/dataset/routed-runs?format=csv`

Current schema: **1.1**.

This contains Bearing-hosted Route, Trio and Challenger runs, including:

- the original recommendation rank;
- candidate model scores and roles;
- current open-weight/local-capability metadata;
- runtime error state;
- the blind judge verdict where applicable;
- the person's preference where supplied.

These runs have `execution_location = "bearing_hosted"`.

## Recommendation evidence versus snapshots

The main dataset contains two kinds of model metadata.

### Recommendation metadata

`models_recommended` includes fields such as:

```json
{
  "slug": "qwen3.5-9b",
  "rank": 2,
  "weighted_score": 0.73,
  "model_class": "chat",
  "open_weights": 1,
  "is_open_weight": true,
  "local_capable": true
}
```

These openness/local fields reflect the catalogue **at export time**. This makes
the latest dataset immediately useful, but it should not be interpreted as a
historical snapshot when a model's metadata has changed since the task.

### Selection-time model snapshot

New selections persist `model_selected.model_metadata` at the moment the choice
is made:

```json
{
  "provider": "Qwen",
  "model_class": "chat",
  "open_weights": 1,
  "licence_openness": 1,
  "is_open_weight": true,
  "local_capable": true,
  "snapshot_source": "selection_time_catalogue"
}
```

Existing selections that pre-date this schema are backfilled from the current
catalogue and explicitly marked:

```json
{
  "snapshot_source": "backfill_current_catalogue"
}
```

That provenance prevents a backfilled value being mistaken for evidence that
was known at the time of the original choice.

## Choice context and hardware

When someone selects a model, Bearing can persist a privacy-safe
`choice_context`.

Example:

```json
{
  "schema_version": "1",
  "filters": {
    "open_only": true,
    "local_only": true,
    "hardware_fit_only": true
  },
  "hardware_profile": {
    "platform": "macos",
    "architecture": "arm64",
    "memory_gb": 32,
    "gpu_vendor": "apple"
  },
  "predicted_hardware_fit": {
    "fits": true,
    "best_quant": "Q4_K_M",
    "memory_budget_gb": 25.6,
    "estimated_runtime_gb": 18.2,
    "headroom_gb": 7.4,
    "confidence": "medium"
  }
}
```

The hardware profile is intentionally coarse. Bearing does **not** put the
browser user-agent, IP address or detailed GPU model/description into this
dataset.

The context tells us useful things such as:

- whether a person explicitly filtered to open models;
- whether they wanted local-capable models;
- whether they used the hardware-fit filter;
- whether the chosen model was predicted to fit the hardware profile they
  confirmed.

It still does **not** tell us that the model actually ran.

## Observed execution

Actual execution evidence belongs in `execution_observations`, not in
`choice_context`.

`execution_purpose` distinguishes a real user workload (`task_execution`)
from a small runtime check (`verification_probe`). Bearing's first local
runtime integration uses a fixed, non-user prompt to verify that a reviewed
model genuinely loads and runs in the person's own Ollama installation.

The execution schema can represent:

```json
{
  "model_slug": "qwen3.5-9b",
  "execution_location": "user_local",
  "execution_purpose": "verification_probe",
  "runtime": "ollama",
  "runtime_version": "0.32.15",
  "runtime_model_id": "qwen3.5:9b",
  "quant": "Q4_K_M",
  "context_length": 2048,
  "hardware_profile": {
    "platform": "macos",
    "architecture": "arm64",
    "memory_gb": 32,
    "gpu_vendor": "apple"
  },
  "measured_vram_gb": 7.4,
  "tokens_per_second": 34.2,
  "latency_ms": 1280,
  "prompt_tokens": 20,
  "output_tokens": 16,
  "total_duration_ms": 1280,
  "load_duration_ms": 420,
  "prompt_eval_duration_ms": 110,
  "evidence_source": "runtime_api"
}
```

Supported evidence-source categories are:

- `bearing_run` — Bearing executed the request;
- `runtime_api` — evidence came from a local/runtime API such as Ollama;
- `user_report` — explicitly reported by the person;
- `imported` — imported from another reviewed evidence source.

For Ollama verification probes, the fixed probe text stays on the local
machine; Bearing receives only the structured runtime measurements and coarse
hardware context. A failed or unreachable local probe is not stored as
successful execution evidence.

## Current task dimensions

Schema 2.0 exposes the task dimensions that currently feed Bearing's decision
engine, including:

- task type and subtype;
- complexity;
- input and output length;
- vision, tools, code and reasoning requirements;
- data sensitivity;
- latency target;
- expected volume;
- long-context need;
- multilingual need;
- agentic workload;
- recurrence;
- mode;
- priority order, exclusions and effective factor weights;
- pipeline stages;
- classification schema version.

## Privacy boundary

Bearing's learning model is structured around retaining **decision evidence**
rather than raw work content.

The public/learning data model does not require:

- raw task descriptions;
- raw prompts;
- raw model responses;
- email addresses;
- IP addresses;
- browser user-agent strings;
- detailed GPU model strings.

Where prompts or outputs need to be associated with experiments, Bearing stores
hashes rather than the text itself unless a specific product feature genuinely
requires otherwise.

## Interpretation notes

- `weighted_score` is ranking machinery, not a probability of success.
- `is_open_weight` means strong open-weight evidence; it does not by itself
  mean the training data, methodology and licence are all fully open.
- `local_capable` means Bearing has reviewed local execution/quantisation
  evidence. It does not mean the model fits every machine.
- `predicted_hardware_fit` is an estimate.
- `execution_observations` are reserved for actual execution evidence.
- `verification_probe` means a fixed runtime check, not the user's real task.
- Operational provider availability is separate from intrinsic model quality.
