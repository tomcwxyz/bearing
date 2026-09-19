# Open & local model evidence

**Status:** implementation started  
**Started:** 2026-09-19  
**Theme:** distinguish openness, execution feasibility and observed performance

## Why this exists

Bearing already recommends several open-weight models and has a small local-inference layer, but the evidence is uneven. In production on 2026-09-19:

- 61 models are active;
- 30 score at least 0.8 for open weights;
- 22 active models have `local_info`;
- only 16 of the strongly open-weight models have `local_info`.

Open, local and available are different claims:

1. **Open-model evidence** — weights, licence, methodology and training-data openness.
2. **Local execution evidence** — quantisations, memory footprint, runtime compatibility and hardware fit.
3. **Hosted execution evidence** — a provider currently exposes a route for the model.
4. **Task suitability** — the model is a good fit for the actual job.
5. **Observed performance** — Bearing has run it and has latency/outcome evidence.

Bearing must keep these layers separate.

## Product behaviour

### Open-model filter

Results gain an explicit **Open models only** view. A model currently qualifies when
`transparency.open_weights >= 0.8`.

This is deliberately labelled open-weight evidence internally. It must not imply
that the training data, methodology or licence are fully open. Those dimensions
remain visible separately.

A future **Prefer open** mode may nudge ranking, but only through an explicit,
testable policy. The first release filters the existing ranking rather than
silently changing scores.

### Local-capable filter

Results also gain a separate **Runs locally** filter.

A model is local-capable when Bearing has concrete quantisation/runtime evidence
(`local_info.quant_options`), not merely because its weights are downloadable.

Open and local filters compose but are not synonyms.

### Hardware fit

The new hardware contract separates the device profile from the model fit:

```ts
interface HardwareProfile {
  platform: 'macos' | 'windows' | 'linux'
  architecture: 'arm64' | 'x64'
  memoryGb: number
  gpu?: {
    vendor: 'apple' | 'nvidia' | 'amd' | 'intel'
    model?: string
    vramGb?: number
  }
  runtime?: 'ollama' | 'lm-studio' | 'llama.cpp' | 'mlx' | 'transformers'
}
```

The first deterministic helper assesses a model against an **explicit memory
budget**. Bearing does not yet guess how much of arbitrary system RAM is usable.
Context/runtime overhead will be added only with evidence.

## External evidence adapters

### Hugging Face

The adapter can fetch, without downloading weights:

- model revision and freshness;
- model-card licence metadata;
- GGUF metadata availability;
- safetensors metadata and parameter counts;
- inference status;
- provider mappings.

The Hugging Face router catalogue is kept as a separate operational source and
can expose provider status, context length, pricing, tool support, structured
output support and optional latency/throughput observations.

Hosted availability must never be written into intrinsic model quality.

### Ollama

The adapter reads both:

- the public Ollama Cloud `/api/tags` catalogue;
- a local Ollama daemon's `/api/tags`.

This exposes concrete model names plus, where supplied, format, family,
parameter size and quantisation.

Ollama Cloud is also an execution route. `npm run eval:open-models` provides
an opt-in smoke test when `OLLAMA_API_KEY` is supplied.

## Evaluation

Two tools are introduced:

```bash
npm run audit:open-models
```

Observational catalogue audit. It reports Bearing's open/local coverage and
non-persisted catalogue matches.

```bash
OPEN_MODEL_PROVIDER=ollama \
OPEN_MODEL_MODELS=qwen3.5:397b \
OLLAMA_API_KEY=... \
npm run eval:open-models
```

or:

```bash
OPEN_MODEL_PROVIDER=huggingface \
OPEN_MODEL_MODELS=Qwen/example \
HF_TOKEN=... \
npm run eval:open-models
```

The live probe checks summarisation, extraction, coding and reasoning tasks and
records basic routability/latency/output evidence. It does **not** change
production ranking.

## Phases

### O1 — truthful filters and contracts

- [x] define open-weight threshold helper;
- [x] define open/local preferences independently;
- [x] define hardware profile contract;
- [x] deterministic memory-budget fit helper;
- [x] Hugging Face catalogue adapter;
- [x] Ollama cloud/local catalogue adapter;
- [x] observational audit script;
- [x] opt-in execution probe;
- [x] surface open/local metadata on `ScoredModel`;
- [x] add Open models only filter to results;
- [x] add Runs locally filter to results;
- [x] remove the remaining local "% match" presentation.

### O2 — backfill evidence — in progress

A versioned reviewed-evidence registry now records identity mappings, evidence status,
source URLs and review dates. The first reviewed tranche contains ten models:

- six **confirmed local** mappings ready for safe `local_info` backfill:
  Gemma 3 27B, Llama 3.3 70B Instruct, Hermes 3 70B, LFM2-24B-A2B,
  Qwen 3.5 9B and Qwen 3.6 27B;
- GLM-5.2 and DeepSeek V4 Pro recorded as **hosted-only** for their reviewed Ollama routes;
- Kimi K2.7 Code and Kimi K3 recorded as **weights available** without pretending
  that publication of very large weights implies ordinary local feasibility.

The backfill command only writes reviewed `confirmed_local` entries and only
when `models.local_info` is currently null:

```bash
npm run db:backfill-local-evidence
npm run db:backfill-local-evidence -- --apply
```

- [x] add initial reviewed Hugging Face IDs for open models;
- [ ] complete reviewed identity mappings across the open-model set;
- [ ] backfill confirmed-local models currently missing `local_info`;
- [x] record provenance and checked-at timestamps for reviewed local/open evidence;
- [x] distinguish weights available / hosted-only / confirmed-local evidence;
- [ ] distinguish official weights from third-party quantisations at variant level;
- [ ] capture broader GGUF/MLX/runtime variants;
- [ ] capture licence identifiers without collapsing them into a binary open/closed label.

### O3 — hardware-aware recommendations

- [ ] optional saved hardware profile;
- [ ] detect/local-import Ollama hardware/runtime evidence where the user opts in;
- [ ] account for task context length and runtime overhead;
- [ ] show "fits your hardware" as evidence, not a guarantee;
- [ ] record measured tokens/sec separately from estimated fit.

### O4 — observed open-model performance

- [ ] version an open-model task corpus;
- [ ] run selected models through Ollama Cloud/Hugging Face providers;
- [ ] compare hosted and local runs of the same model/version where possible;
- [ ] persist execution evidence separately from model capability evidence;
- [ ] connect human outcomes only after support is sufficient.

## Guardrails

- Never call a model "open source" solely because its weights are downloadable.
- Never infer task quality from downloads, likes or provider availability.
- Never infer local feasibility from parameter count alone when quant/runtime
  evidence is absent.
- Never let a temporary hosted-provider outage reduce intrinsic model scores.
- External catalogue data starts observational; reviewed mappings are required
  before it affects production behaviour.
- Downloadable weights do not make a model local-capable. The local filter
  requires a reviewed execution footprint/quantisation or equivalent runtime evidence.
