# Bearing

**Find the right AI model for your task.**

Describe what you want to do, tell us what matters to you, and get a ranked shortlist of models with transparent scoring across 7 factors. Building search or RAG? Describe the job and Bearing routes you to ranked embedding models too. Compare models head-to-head with real prompts. See which open-weight models you can run locally.

The tool collects structured outcome data on what people actually want AI to do and which models work. This dataset — anonymised and published openly — is a core output, not a byproduct.

Built by [The Good Ship](https://good-ship.co.uk) · [tomcw.xyz](https://tomcw.xyz) | [MIT License](LICENSE)

## Features

### Recommend

*"I need to do X — what should I use?"*

Describe your task, answer clarifying questions, rank your priorities. Get a ranked list with transparent per-factor scoring and plain-English reasoning. Complex tasks automatically boost quality and capability weights. Toggle off factors you don't care about.

### Embedding models

*"I need to turn text into vectors for search / RAG."*

Embedding models are a first-class category, hard-separated from chat models by a `model_class` routing filter — embedding tasks never see chat models and vice versa. Just describe an embedding job in the normal flow and Bearing recognises it and routes you straight to ranked embedding models (dimension, max input, Matryoshka support, MTEB quality, per-1M pricing). For a guided path, the model registry has a Chat/Embedding filter and a dedicated finder at `/embedding`. Embedding stages inside a pipeline are routed the same way.

### Validate

*"I'm using GPT-5.4 for everything — is that right?"*

Name your current model and what you use it for. See where it sits in the ranking — good fit, overpaying, or better options exist.

### Compare

*"Show me the difference."*

Pick any two models, send the same prompt, see real outputs side by side. Works with text prompts and PDF/CSV attachments. You pick which response you preferred — generating high-quality pairwise preference data.

Two ways in: via recommendations (pre-scored model list) or directly at `/compare` (pick any two models, no classification needed).

### Pipeline recommendations

For multi-stage tasks, Bearing recommends specialist model pipelines — e.g. a vision model for OCR followed by a smaller model for structuring, rather than one expensive model doing everything.

### Run it locally

Open-weight models are shown with hardware tier estimates (consumer laptop through server-class). Quantization options from Q2_K through Q8_0 with VRAM requirements calibrated for Apple Silicon unified memory and dedicated GPUs. Links to Ollama, LM Studio, and llama.cpp.

## How scoring works

Every model is scored across **7 factors**:

| Factor | What it measures |
|--------|-----------------|
| **Quality** | Task-specific fitness from benchmarks and capability data |
| **Capability** | Required features (vision, code, tools, long context, extended thinking) |
| **Cost** | Estimated per-task cost using log-scale normalisation |
| **Transparency** | Open weights, training data, methodology, FMTI scores |
| **Privacy** | Data retention and handling policies |
| **Sustainability** | Inference energy, training footprint, provider infrastructure |
| **Speed** | Response latency |

Your priority ranking shifts the weights (rank 1 gets ~28%, rank 7 gets ~4%). Users can **exclude** factors entirely — excluded factors get zero weight, remaining factors renormalise.

**Complexity boost**: complex tasks automatically amplify quality (1.5×) and capability (1.3×) weights before normalisation, so frontier models rank higher when the task genuinely needs them. Moderate tasks get a smaller boost (1.2×/1.1×).

**Model-class routing**: a `model_class` hard filter runs before any factor scoring — `embedding` tasks route only to embedding models and every other task routes only to chat models. Embedding quality is anchored to MTEB rather than the chat factor mix.

The scoring function is a pure, tested TypeScript function — no black box.

## Rating methodology

All model ratings are researched and documented in [docs/model-ratings.md](docs/model-ratings.md). Key choices:

- **Quality scores** are task-fitness estimates derived from public benchmarks (LMSYS Chatbot Arena, LiveBench, SWE-bench) cross-referenced with capability profiles. These are the weakest signal and will improve with outcome data.
- **Sustainability scores** follow a documented formula: `0.4 × inference_energy + 0.2 × training_footprint + 0.4 × provider_infrastructure`. Provider data sourced from corporate sustainability reports, PUE/WUE disclosures, and renewable energy commitments. For the major hosted models, `inference_energy` is **grounded in real per-request carbon estimates from [EcoLogits](https://ecologits.ai)** on a fixed gCO₂eq efficiency curve, refreshed weekly; each model records whether its value is measured or curated. Embedding model quality additionally draws on **MTEB** (Massive Text Embedding Benchmark).
- **Transparency scores** weight: open weights (25%), open training data (20%), open methodology (15%), licence openness (15%), provider disclosure (10%), FMTI company score (15%). FMTI scores from the Stanford Foundation Model Transparency Index 2025.
- **Privacy scores** reflect published data policies: Anthropic and IBM score highest (no training on user data by default), DeepSeek and Moonshot AI lowest (China-based hosting, less clear retention policies).
- **Cost scoring** uses log-scale normalisation with a 0.05 floor — prevents the most expensive model from scoring a flat zero, which would make it unrecommendable even when cost is the user's lowest priority.

## Model registry (v0.9.0)

41 models across 17 providers — 31 chat models and 10 embedding models.

**Chat models**

| Provider | Models |
|----------|--------|
| **Anthropic** | Claude Opus 4.7, Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| **OpenAI** | GPT-5.4, GPT-5.4 Mini, GPT-5.4 Nano |
| **Google** | Gemini 3.1 Pro, Gemini 3 Flash, Gemini 2.5 Flash-Lite |
| **DeepSeek** | V4 Pro, V3.2, V3.1, R1, R1 0528 |
| **Meta** | Llama 4 Maverick |
| **Mistral** | Medium 3, OCR (Pixtral Large), Codestral, Devstral |
| **Alibaba** | Qwen 3.5 397B, Qwen 3 235B, Qwen 2.5 72B |
| **Moonshot AI** | Kimi K2, Kimi K2.5 |
| **MiniMax** | M2.5, M2.7 |
| **xAI** | Grok 4 |
| **GreenPT** | GreenL (Mistral Small 3.2 24B), GreenR (GPT-OSS 120B) |
| **IBM** | Granite 4.0 Micro |

**Embedding models**

| Provider | Models |
|----------|--------|
| **OpenAI** | text-embedding-3-large, text-embedding-3-small |
| **Voyage AI** | voyage-3-large, voyage-3-lite |
| **Cohere** | embed-v4 |
| **Mistral** | mistral-embed-2 |
| **GreenPT** | green-embedding (Qwen3-Embedding-4B) |
| **BAAI** | BGE-M3 |
| **Nomic AI** | nomic-embed-text-v2-moe |
| **Alibaba** | gte-Qwen2-7B-instruct |

22 open-weight models include local inference data (parameter counts, MoE architecture, quantization VRAM estimates).

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 16 (App Router, Turbopack), TypeScript |
| Styling | Tailwind CSS v4, Fraunces + DM Sans + JetBrains Mono |
| Database | Neon (Postgres, serverless driver, raw SQL) |
| Classification | Claude Haiku 4.5 via Anthropic SDK |
| Comparison | OpenRouter + direct provider APIs (GreenPT, Mistral) |
| Benchmarks | LMArena, LiveBench, Artificial Analysis, MTEB; EcoLogits for inference carbon |
| Model data | Static JSON registry generated from DB |
| Auth | Magic link emails via Resend |
| Hosting | Vercel |

## Getting started

```bash
git clone https://github.com/dataforaction-tom/bearing.git
cd bearing
npm install

# Set up environment
cp .env.local.example .env.local
# Required keys:
#   ANTHROPIC_API_KEY    — Claude Haiku for classification
#   NEON_DATABASE_URL    — Postgres connection
#   OPENROUTER_API_KEY   — model comparisons
#   RESEND_API_KEY       — magic link emails
#   AUTH_SECRET          — HMAC signing
# Optional:
#   GREENPT_API_KEY      — GreenPT direct API
#   MISTRAL_API_KEY      — Mistral direct API
#   CRON_SECRET          — guards the weekly EcoLogits carbon-refresh endpoint

# Run migrations
for f in src/db/migrations/*.sql; do psql $NEON_DATABASE_URL -f "$f"; done

# Seed models from registry
npm run db:seed

npm run dev
```

## Project structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # Home — task input (Recommend / Validate)
│   ├── recommend/[taskId]/       # Recommend flow
│   │   ├── page.tsx              # Clarification questions
│   │   ├── priorities/page.tsx   # Priority ranking + factor exclusion
│   │   ├── results/              # Ranked results + pipeline + local
│   │   └── feedback/page.tsx     # Outcome feedback
│   ├── embedding/                # Embedding finder + results
│   ├── compare/                  # Compare flow
│   │   ├── page.tsx              # Direct compare (pick any 2 models)
│   │   └── [taskId]/             # Task-based compare + results
│   ├── validate/                 # Validate flow
│   ├── models/                   # Browsable registry (Chat/Embedding filter)
│   ├── data/                     # Public dataset export
│   ├── admin/                    # Admin UI (auth-gated)
│   └── actions.ts                # Server actions
├── lib/
│   ├── scoring.ts                # Pure 7-factor scoring function + class routing
│   ├── weights.ts                # Priority → weight conversion + complexity boost
│   ├── local-inference.ts        # Hardware tiers + local model scoring
│   ├── pipeline.ts               # Multi-stage pipeline recommendations
│   ├── benchmarks.ts             # Benchmark ingest + blend (LMArena/LiveBench/AA/MTEB)
│   ├── ecologits-grounding.ts    # EcoLogits carbon grounding for inference_energy
│   ├── openrouter.ts             # OpenRouter + direct provider API calls
│   ├── classification.ts         # Haiku task classification
│   ├── reasoning.ts              # Haiku reasoning generation
│   ├── content-filter.ts         # Prompt safety filter
│   └── db.ts                     # Neon connection + queries
├── data/
│   └── bearing-registry.json     # 41 models (31 chat + 10 embedding)
├── prompts/
│   ├── classify.md               # Classification prompt
│   └── reason.md                 # Reasoning prompt
└── db/migrations/
    └── 001–022                   # Postgres schema migrations
```

## Testing

```bash
npm test        # 185 tests across 13 suites (vitest)
npm run build   # Production build
npm run lint    # ESLint
```

Tests cover the scoring engine (including model-class routing), weight conversion (complexity boost and factor exclusion), registry loader, classification parsing, local inference scoring, benchmark normalisation, and the EcoLogits carbon curve.

## Privacy

We do not store raw task descriptions or prompts. What we store: hashed descriptions (SHA-256, for dedup), classified task attributes, model recommendations, selections, and outcomes. Comparison prompts are hashed before storage. The anonymised dataset contains task type, priorities, model chosen, and outcome — never the original text.

## Contributing

The scoring function, quality estimates, and default weights are all in the repo. They're approximations — the question is whether they're useful enough to learn from. PRs welcome, especially to the model registry and rating methodology.

## Licence

[MIT](LICENSE)
