# Open & local model evidence

**Status:** active implementation; browser-local Ollama execution now wired  
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
source URLs and review dates. The first reviewed tranche now covers all 14 models that were missing local evidence:

- eight **confirmed local** mappings ready for safe `local_info` backfill:
  Gemma 3 27B, Llama 3.3 70B Instruct, Hermes 3 70B, Hermes 4 405B,
  LFM2-24B-A2B, Qwen 3.5 9B, Qwen 3.6 27B and the Qwen3-Embedding-4B
  backbone behind GreenPT green-embedding;
- GLM-5.2 and DeepSeek V4 Pro are **hosted open models** in the reviewed
  Ollama routes even though official weights also exist;
- Qwen3.6 Plus is **provider-only** in reviewed evidence and is therefore
  excluded from the Open models only filter despite its stale editorial row;
- Kimi K2.7 Code, Kimi K3 and MiMo V2.5 Pro are **weights available** without
  pretending that publication of very large weights implies ordinary local feasibility.

Hermes 4 demonstrates why hardware evidence matters: its reviewed LM Studio GGUF
runs through llama.cpp, but the artefacts range from roughly 213 GB at Q3 to
431 GB at Q8. "Can self-host" and "fits my machine" must remain separate claims.

The backfill command only writes reviewed `confirmed_local` entries and only
when `models.local_info` is currently null:

```bash
npm run db:backfill-local-evidence
npm run db:backfill-local-evidence -- --apply

# Reviewed corrections where old editorial openness conflicts with source evidence
npm run db:apply-open-weight-corrections
npm run db:apply-open-weight-corrections -- --apply
```

- [x] add initial reviewed Hugging Face IDs for open models;
- [x] complete reviewed identity mappings across the original 14-model gap set;
- [x] backfill the eight confirmed-local models previously missing `local_info`;
- [x] record provenance and checked-at timestamps for reviewed local/open evidence;
- [x] distinguish weights available / hosted-only / confirmed-local evidence;
- [x] let reviewed provider-only evidence override stale open-weight filter metadata;
- [x] add a dry-run-first path to correct stale canonical transparency rows;
- [x] add model-family grounding so Alibaba Plus/Max/Flash/Turbo do not inherit the provider-wide open default;
- [ ] distinguish official weights from third-party quantisations at variant level;
- [ ] capture broader GGUF/MLX/runtime variants;
- [ ] capture licence identifiers without collapsing them into a binary open/closed label.

### O3 — hardware-aware recommendations — implementation started

The first browser-side slice uses a deliberately lightweight progressive probe,
inspired by the capability work in SwarmLLM but without its allocate-until-failure
memory test.

On explicit user action Bearing can inspect, locally in the browser:

- WebGPU availability;
- browser-exposed GPU vendor / architecture / description where available;
- WebGPU buffer and storage-binding limits;
- logical processor count;
- the coarse `navigator.deviceMemory` hint where supported;
- a high-entropy architecture hint where the browser elects to provide it.

The probe does **not** treat WebGPU limits as VRAM and does not upload the
detected details. The user confirms or corrects total memory with a small set of
memory choices. The resulting profile is stored only in browser local storage.

Hardware fit then:

1. derives a conservative model-memory budget rather than assuming all reported
   memory is available;
2. gives Apple unified memory and explicit discrete VRAM stronger confidence
   than generic system RAM;
3. adds runtime/context headroom above the raw quantised artefact size;
4. selects the highest-quality reviewed quantisation that fits that budget;
5. labels the result **Likely fits this device** rather than promising execution.

The SwarmLLM-style active allocation probe remains a possible advanced
diagnostic, not a default recommendation step, because deliberately filling GPU
memory creates avoidable pressure for an ordinary Bearing visit.

- [x] optional browser-local saved hardware profile;
- [x] opt-in lightweight WebGPU / CPU / coarse-memory detection;
- [x] manual memory correction when browser memory evidence is absent or coarse;
- [x] conservative runtime-memory overhead;
- [x] add Likely fits this device filter and per-model fit evidence;
- [ ] account for model-specific KV/context overhead rather than the initial generic reserve;
- [ ] allow an optional explicit discrete-GPU VRAM correction;
- [x] detect/import Ollama runtime evidence where the user opts in;
- [x] record measured tokens/sec separately from estimated fit;
- [x] accept compatible installed Ollama variants while retaining reviewed family/size identity;
- [x] support embedding verification through Ollama's embed endpoint;
- [x] allow explicit "try anyway" verification when the conservative fit estimate says no;
- [x] add browser-local task execution for reviewed recommended chat models, with prompt/answer kept off Bearing servers;
- [x] gate recorded local observations with short-lived signed tickets and task-local recommendation validation;
- [ ] add an advanced active device test only if passive evidence proves insufficient.

### O4 — observed open-model performance

- [ ] version an open-model task corpus;
- [ ] run selected models through Ollama Cloud/Hugging Face providers;
- [ ] compare hosted and local runs of the same model/version where possible;
- [x] persist execution evidence separately from model capability evidence;
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
