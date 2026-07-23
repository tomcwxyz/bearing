# How We Rate Models

This page documents the research, sources, and decisions behind every model rating in the Bearing registry. We believe that a recommendation tool should be transparent about its own methodology — so here it all is.

Last updated: 6 May 2026 (Registry v0.7.0)

---

## Scoring overview

Every model is scored from 0.0 to 1.0 across seven factors. When you rank your priorities, Bearing converts your ranking into weights and produces a single match score for each model.

| Factor | What it measures | How it's scored |
|--------|-----------------|----------------|
| **Quality** | How well the model performs on your task type | Per-task fitness scores from benchmarks and evaluation data |
| **Capability** | Whether the model can do what you need | Binary pass/fail for hard requirements (vision, code, tools), graduated for soft matches |
| **Cost** | How much it costs relative to other models | Inverse log-scale against the cheapest model in the registry |
| **Speed** | How fast responses come back | Based on latency tiers and inference benchmarks. 1.0 = sub-second |
| **Privacy** | How your data is handled | Based on data retention policies. 1.0 = no retention, no training on inputs |
| **Sustainability** | Environmental footprint | Composite of inference energy, training footprint, and provider infrastructure |
| **Transparency** | How open the model and provider are | Composite of open weights, training data, methodology, licence, and provider disclosure |

---

## Data sources and grounded scoring

Wherever published benchmark data exists for a model, Bearing uses it directly rather than asking a language model to estimate. We currently ingest from three sources, all updated on a regular schedule, and combine them into per-task scores.

### Benchmark sources

| Source | What it provides | Categories used |
|--------|-----------------|-----------------|
| **[Artificial Analysis](https://artificialanalysis.ai)** | Per-model evaluation indices (intelligence, coding, math) plus standard benchmarks (MMLU-Pro, GPQA, HLE, LiveCodeBench, SciCode, IFBench, Tau2, TerminalBench-Hard, AIME-25, LCR), output throughput, and time-to-first-token | All evaluation keys, plus `aa_speed` and `aa_ttft` for performance signals |
| **[LMArena](https://lmarena.ai)** | Bradley–Terry ratings from human preference voting | Overall, hard prompts, coding, math, creative writing, instruction following, longer query, multi-turn, web-dev, vision |
| **[LiveBench](https://livebench.ai)** | Contamination-resistant per-task benchmarks | Reasoning, coding, mathematics, language, data analysis, instruction following |

Each row is normalised linearly within its cohort (per source, per category, per snapshot date) so the highest-scoring model in the cohort lands at 1.0 and the lowest at 0.0. Latency rows are inverted at ingest so lower TTFT becomes a higher score.

### Mapping source categories to bearing tasks

The same source category can feed multiple bearing tasks where appropriate (LiveBench's `language` informs both `summarise` and `generate`, for example). The full mapping lives in `src/lib/benchmarks.ts` under `CATEGORY_TO_TASKS`. At recommendation time, the score for each `(model, bearing_task)` pair is the mean of every category that maps to it.

### Many-to-one alias matching

Frontier models often appear in several source-side variants — Anthropic's Claude 4.6 Sonnet has separate Artificial Analysis entries for low / high / max effort and reasoning / non-reasoning, for example. Bearing's matcher (`src/lib/import-grounding.ts`) suggests candidates per source using a token-bag fuzzy match, and the admin confirms which represent the registry slug. All confirmed variants count as evidence and their normalised scores are averaged.

The matcher flags candidates that look like distinct sibling products — `mini`, `nano`, `flash-lite`, `vl`, `distill`, and similar size-disambiguator tokens — so the admin can decide rather than silently merging the wrong variant.

### Provider profile lookup

Some scoring fields don't have a published benchmark and depend mostly on the provider's policies, not the specific model. These are filled deterministically from a provider profile rather than by a language model:

| Field | Drives |
|-------|--------|
| `privacy_score` | Data retention, training opt-out, jurisdictional considerations |
| `transparency.open_weights` | Whether the provider publishes weights for this lineup |
| `transparency.transparency_score` | Baseline FMTI-style aggregate (sub-fields refined by Haiku with the baseline as anchor) |

Provider names with parenthetical suffixes (e.g. `Alibaba (via hosted providers)`) are normalised to their canonical form before lookup. Unknown providers fall back to a conservative default (privacy 0.6, open_weights 0, baseline transparency 0.4) and the admin can refine per model.

### Provenance

When you open the import modal or hit **Refresh from benchmarks** on an existing model, every score slider in the admin form carries a small coloured dot indicating where its value came from:

- **Green (benchmark)** — averaged from one or more confirmed source variants. Hover shows the exact `(source, category)` pairs that contributed.
- **Amber (derived)** — deterministic provider lookup or a rule (e.g. the `code` capability flag from grounded code fitness ≥ 0.5).
- **Grey (haiku)** — estimated by Claude Haiku because no published signal was available. Used for `tier`, `sustainability`, transparency sub-fields, strengths, and weaknesses.
- **Light grey (default)** — fallback because the provider isn't in the lookup table yet.

The grounded estimator passes the full benchmark evidence into Haiku's prompt as context for the fields it does still fill (e.g. transparency notes can reference the actual numbers), but Haiku is explicitly forbidden from overriding any grounded value.

### Speed score caveat

Artificial Analysis's speed cohort spans every model they track — including small fast distilled models that pull throughput averages upward. As a result, raw cohort positioning would push frontier flagships near the bottom (Gemini 3 Pro lands at 0.09, for example). For new imports this is the correct cohort signal; for existing models the curated within-tier scores are preserved by default. Run `scripts/reground-registry.ts --include-speed` to override and reset to cohort positioning across the whole registry.

---

## Sustainability methodology

Sustainability is scored across three sub-dimensions, each 0.0 to 1.0. The composite score is the mean of all available values (nulls are excluded, not treated as zero).

### Inference energy

How efficient is the model at inference time?

| Score | Meaning |
|-------|---------|
| 1.0 | Published per-query energy metrics |
| 0.8 | Very small or efficient model |
| 0.6 | Mixture-of-Experts architecture |
| 0.4 | Standard large model |
| null | No data available |

### Training footprint

How much is known about the environmental cost of training?

| Score | Meaning |
|-------|---------|
| 1.0 | Published with carbon offsets |
| 0.7 | Published training energy/compute data |
| 0.4 | Estimated from model size and architecture |
| 0.0 | No information at all |
| null | No data available |

### Provider infrastructure

How clean is the energy powering the model?

| Score | Meaning |
|-------|---------|
| 1.0 | 100% renewable with heat recovery or additional efficiency measures |
| 0.8 | 100% renewable energy |
| 0.6 | Significant commitment with reporting |
| 0.4 | Some renewable energy |
| 0.2 | No commitment |
| null | No data available |

---

## Transparency methodology

Transparency is scored across five sub-dimensions, each 0.0 to 1.0. The composite score is the mean of all five.

We reference the [Stanford CRFM Foundation Model Transparency Index (FMTI) 2025](https://crfm.stanford.edu/fmti/), which evaluates 100 indicators across 13 companies. We also consider the criticism from EleutherAI that FMTI measures commercial documentation rather than genuine openness — so we weight actual accessibility alongside documentation.

### FMTI company scores (2025)

These inform the `provider_disclosure` dimension:

| Company | FMTI Score | Our provider_disclosure |
|---------|-----------|----------------------|
| IBM | 95 | 1.0 |
| AI21 Labs | 72 | 0.7 |
| Writer | 67 | 0.7 |
| Anthropic | 37 | 0.4 |
| Google | 36 | 0.4 |
| Amazon | 36 | 0.4 |
| OpenAI | 35 | 0.4 |
| DeepSeek | 30 | 0.2 |
| Meta | 30 | 0.3 |
| Alibaba | 30 | 0.2 |
| Mistral | 15 | 0.2 |
| xAI | 14 | 0.2 |
| Midjourney | 14 | 0.2 |

### Sub-dimension buckets

| Dimension | 1.0 | 0.7 | 0.3 | 0.0 |
|-----------|-----|-----|-----|-----|
| **Open weights** | Fully downloadable | With registration required | API only | Closed |
| **Open training data** | Documented and accessible | Documented but not accessible | Vague description | None |
| **Open methodology** | Full reproducible paper | Substantial blog/model card | Marketing only | None |
| **Licence openness** | MIT / Apache 2.0 | Open with restrictions | Proprietary, clear terms | Restrictive |
| **Provider disclosure** | FMTI 80+ | FMTI 50–79 | FMTI 30–49 | FMTI <15 |

---

## Provider sustainability research

Research conducted April 2026. All scores are based on publicly available information and may change as providers update their commitments and disclosures.

### Google (Gemini models)

**Provider infrastructure: 0.8** — Google has maintained a 100% renewable energy match on a global basis every year since 2017. They are targeting 24/7 carbon-free energy on every grid they operate by 2030. Google is the only major cloud provider to publish per-query energy data: **0.24 watt-hours per median text prompt** for Gemini (August 2025).

Sources:
- [Google Clean Energy](https://www.google.com/about/datacenters/cleanenergy/)
- [5 years of 100% renewable energy — Google Cloud Blog](https://cloud.google.com/blog/topics/sustainability/5-years-of-100-percent-renewable-energy)
- [Hannah Ritchie — AI carbon footprint update (August 2025)](https://hannahritchie.substack.com/p/ai-footprint-august-2025)

### Anthropic (Claude models)

**Provider infrastructure: 0.4** — Anthropic committed to covering 100% of grid upgrade costs required by their data centres, water-efficient cooling, and energy price offsets for ratepayers. However, they have not published a renewable energy target or sustainability report. Data centres are located in Texas, New York, and Louisiana.

Sources:
- [Anthropic — Covering electricity price increases](https://www.anthropic.com/news/covering-electricity-price-increases)
- [Anthropic Emissions Breakdown — DitchCarbon](https://ditchcarbon.com/organizations/anthropic)
- [Sustainability Magazine — Why is Anthropic pledging to offset its AI energy costs?](https://sustainabilitymag.com/news/why-anthropic-pledging-offset-ai-energy-costs)

### OpenAI (GPT models)

**Provider infrastructure: 0.4** — OpenAI's CEO stated that ChatGPT uses approximately **0.34 watt-hours per average query**. OpenAI claims 100% renewable energy by 2027, but this currently flows through Microsoft Azure's Renewable Energy Certificates (RECs) rather than direct power purchase agreements. As of March 2026, OpenAI has published zero verified Scope 1, 2, or 3 emissions figures.

Sources:
- [MIT Technology Review — AI energy usage](https://www.technologyreview.com/2025/05/20/1116327/ai-energy-usage-climate-footprint-big-tech/)
- [The Sustainable Innovation — Open AI Sustainability](https://thesustainableinnovation.com/open-ai/)
- [OpenAI, Oracle and Vantage — Green Energy Partnership](https://datacentremagazine.com/news/openai-oracle-and-vantage-forge-green-energy-partnership)

### Meta (Llama models)

**Provider infrastructure: 0.8** — Meta claims to run global operations with 100% renewable energy and aims for net-zero emissions across its value chain by 2030. They also target being water-positive by 2030 and use dry cooling at new facilities (no water demands for cooling). However, for API users accessing Llama through third-party providers, sustainability depends on the hosting provider's infrastructure.

Sources:
- [Meta — Delivering AI, Creating Community Benefits](https://about.fb.com/news/2025/11/metas-30th-data-center-delivering-ai-supporting-wetlands-restoration/)
- [Fortune — Big tech climate goals and data centres](https://fortune.com/2026/03/29/big-tech-climate-change-goals-data-centers-ai-fossil-fuels/)

### Mistral (Codestral, Devstral, Medium 3, OCR)

**Provider infrastructure: 0.55** — Mistral invested €1.2 billion in a partnership with EcoDataCenter to build an AI data centre in Borlänge, Sweden, running on renewable energy with advanced cooling. Their Paris facility runs on France's low-carbon nuclear grid. Mistral has also launched a sustainability auditing tool for industry-wide transparency. Scored between the "significant commitment" (0.6) and "some renewable" (0.4) buckets.

Sources:
- [Mistral AI and EcoDataCenter — Sweden AI data centre](https://capacityglobal.com/news/mistral-ai-ecodatacenter-partner-ai-data-centre-sweden/)
- [CNBC — Mistral secures $830 million for Paris data centre](https://www.cnbc.com/2026/03/30/mistral-ai-paris-data-center-cluster-debt-financing.html)
- [Euronews — Mistral raises $830m for European AI infrastructure](https://www.euronews.com/next/2026/03/30/europe-needs-ai-cloud-infrastructure-mistral-raises-830m-for-data-centre-near-paris)

### xAI (Grok)

**Provider infrastructure: 0.15** — xAI's Memphis Colossus data centre has been operating gas turbines without emission permits since August 2025. Plans call for 2 gigawatts of capacity (enough to power 1.5 million homes). An 88-acre solar array has been proposed but is not yet built. 168 Tesla Megapacks have been installed for battery storage. Despite this, the overall sustainability profile is among the worst of any major AI provider.

Sources:
- [Tennessee Lookout — Data centre battle along Mississippi-Tennessee line](https://tennesseelookout.com/2026/03/18/a-battle-over-data-centers-heats-up-along-the-mississippi-tennessee-state-line/)
- [Time — Elon Musk's Memphis AI Data Center raises pollution concerns](https://time.com/7021709/elon-musk-xai-grok-memphis/)
- [TBA — Tech, Toxins, and Memphis: Environmental Footprint of the xAI Facility](https://www.tba.org/?pg=Hastings2025AIX)

### GreenPT (GreenL, GreenR)

**Provider infrastructure: 1.0** — GreenPT runs 100% on renewable energy with heat recovery (server waste heat is used for community heating). They publish real-time energy metrics per query (mWh per 100 tokens). Their Power Usage Effectiveness (PUE) is 1.37 versus an industry average of 1.57. Their Water Usage Effectiveness (WUE) is 0.067 versus an industry average of 1.8 — a 96% improvement. They achieve 20–30% compute reduction through model compression and quantization. EU-hosted with full GDPR compliance.

The training of the underlying models (Mistral Small 3.2 for GreenL, GPT-OSS 120B for GreenR) was not done on GreenPT's green infrastructure, which is why the training footprint sub-score is lower.

Sources:
- [GreenPT — AI impact on the environment](https://greenpt.com/blog/ai-impact-environment/)
- [GreenPT — New API integrations: Scraper, OCR](https://greenpt.com/blog/new-api-integrations-scraper-ocr-now-available-in-the-greenpt-api/)
- [EcoCompute — GreenPT presentation](https://www.eco-compute.io/files/slides_2025/01_Thursday/01_SoHa/08_Keus_GreenPT.pdf)

### DeepSeek (R1, R1 0528, V3.1, V3.2)

**Provider infrastructure: 0.2** — DeepSeek's MoE architecture is inherently efficient, activating only 37 billion of 671 billion parameters during inference, with 93.3% memory reduction techniques. However, China's energy grid is heavily coal-based, and DeepSeek publishes no sustainability data or commitments. Reasoning models (R1, R1 0528) consume significantly more energy per query due to long chains of thought — HuggingFace found reasoning models use 30x more energy on average.

Sources:
- [S&P Global — Potential impacts of DeepSeek on datacenters and energy demand](https://www.spglobal.com/market-intelligence/en/news-insights/research/potential-impacts-of-deepseek-on-datacenters-and-energy-demand)
- [SingularityHub — Reasoning models use 30x more energy](https://singularityhub.com/2025/12/15/hugging-face-says-ai-models-with-reasoning-use-100x-more-energy-than-those-without/)
- [ScienceDirect — Does DeepSeek curb data centre energy surge?](https://www.sciencedirect.com/science/article/pii/S266667582500147X)

### IBM (Granite)

**Provider infrastructure: 0.55** — IBM has the highest FMTI score (95/100), which includes disclosure on compute infrastructure. They publish training compute and energy data and provide smaller models that run on consumer hardware. Scored between "significant commitment" and "some renewable" buckets, weighted upward by their exceptional disclosure practices.

Sources:
- [IBM — Granite 3.3 announcement](https://www.ibm.com/new/announcements/ibm-granite-3-3-speech-recognition-refined-reasoning-rag-loras)
- [Signal65 — IBM Granite Benchmarking and Enterprise Readiness](https://signal65.com/wp-content/uploads/2025/02/Signal65-Validation_IBM-Granite-Benchmarking-and-Enterprise-Readiness.pdf)

### Moonshot AI (Kimi K2, K2.5) and MiniMax (M2.5, M2.7)

**Provider infrastructure: 0.2** — Both are China-based providers with no published sustainability data or renewable energy commitments. Scored at the minimum for operating providers.

### General energy context

According to research, AI is responsible for approximately 100 terawatt-hours of electricity globally in 2025. The HuggingFace AI Energy Score project measures energy consumption across models using standardised hardware (NVIDIA H100 GPUs), finding that reasoning models consume 30x more energy on average than non-reasoning models.

Sources:
- [HuggingFace AI Energy Score](https://huggingface.github.io/AIEnergyScore/)
- [Earth911 — Your AI Carbon Footprint](https://earth911.com/business-policy/your-ai-carbon-footprint-what-every-query-really-costs/)
- [Innovating with AI — How much energy does AI consume?](https://innovatingwithai.com/how-much-energy-does-ai-actually-consume/)

---

## Model capability decisions

### DeepSeek V3.2 — vision removed

DeepSeek V3.2 was previously listed with vision capability, but research confirmed it does **not** have native vision support. Vision is expected in DeepSeek V4, which was in limited testing as of April 2026. The vision capability and all vision task fitness scores have been removed.

Sources:
- [DeepSeek API Docs — V3.2 Release](https://api-docs.deepseek.com/news/news251201)
- [TechNode — DeepSeek V4 test interface suggests Vision mode](https://technode.com/2026/04/08/deepseek-v4-may-launch-this-month-test-interface-suggests-vision-and-expert-modes/)

### GreenPT GreenL — vision added

GreenPT GreenL is powered by Mistral Small 3.2 (24B), which has native vision support — it can process and reason over both text and image inputs. The vision task fitness is set to 0.68 based on the underlying model's capabilities. GreenPT also offers dedicated OCR and Scraper APIs for document processing.

Sources:
- [Mistral Small 3.2 — HuggingFace](https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506)
- [GreenPT — OCR and Scraper API integrations](https://greenpt.com/blog/new-api-integrations-scraper-ocr-now-available-in-the-greenpt-api/)

### GreenPT GreenR — extended thinking added

GPT-OSS 120B (the model powering GreenR) has full chain-of-thought reasoning and adjustable reasoning effort, qualifying it for the `extended_thinking` capability.

Sources:
- [OpenAI — Introducing GPT-OSS](https://openai.com/index/introducing-gpt-oss/)
- [OpenAI — GPT-OSS Model Card](https://openai.com/index/gpt-oss-model-card/)

### Kimi K2.5 — video added

Kimi K2.5 demonstrates strong video understanding capabilities, scoring 86.6% on VideoMMMU. It also supports agent swarm execution for parallel sub-task processing.

Sources:
- [Moonshot AI — Kimi K2.5 Tech Blog](https://www.kimi.com/blog/kimi-k2-5)
- [InfoQ — Kimi K2.5 with Vision and Agent Swarm](https://www.infoq.com/news/2026/02/kimi-k25-swarm/)

### Qwen 3 235B — vision not included

The base Qwen3-235B-A22B is a text-only model. The vision-language variant (Qwen3-VL-235B-A22B) is a separate model. We represent the base text model in the registry. Note that Qwen 3.5 (the newer generation) is natively multimodal — vision is built into the base architecture.

Sources:
- [Qwen3-235B-A22B — HuggingFace](https://huggingface.co/Qwen/Qwen3-235B-A22B)
- [Qwen3-VL Technical Report](https://arxiv.org/abs/2511.21631)

### IBM Granite 3.3 — vision not in base, family noted

The Granite 3.3 8B Instruct model in our registry is a text-only model. IBM has separate vision models in the Granite family (granite-vision-3.3-2b, granite-4.0-3b-vision) designed for document understanding, OCR, and chart analysis. We note the family in the model's strengths but represent the 8B text model as the primary entry.

Sources:
- [IBM — Granite 3.3 8B Instruct — HuggingFace](https://huggingface.co/ibm-granite/granite-3.3-8b-instruct)
- [IBM — Granite Vision models](https://www.ibm.com/granite/docs/models/vision)
- [IBM — Granite 4.0 3B Vision — HuggingFace](https://huggingface.co/ibm-granite/granite-4.0-3b-vision)

---

## Task fitness research

Task fitness scores represent how well a model performs on specific task types, from 0.0 to 1.0. These are informed by benchmark data, public evaluations, and comparative analysis. Here are the key adjustments made in the v0.5.0 audit, with sources.

### MiniMax M2.7 — code: 0.78 → 0.86

MiniMax M2.7 achieved 56.22% on SWE-Pro (matching GPT-5.3-Codex), 78% on SWE-bench Verified (significantly outperforming Opus at 55%), and 86.2% on PinchBench (within 1.2 points of Opus). The model was also open-sourced in April 2026. Pricing was corrected from $1.00/$4.00 to $0.30/$1.20 per million tokens.

Sources:
- [MiniMax — M2.7 announcement](https://www.minimax.io/news/minimax-m27-en)
- [VentureBeat — MiniMax M2.7 is self-evolving](https://venturebeat.com/technology/new-minimax-m2-7-proprietary-ai-model-is-self-evolving-and-can-perform-30-50)
- [MarkTechPost — MiniMax M2.7 open-sourced](https://www.marktechpost.com/2026/04/12/minimax-just-open-sourced-minimax-m2-7-a-self-evolving-agent-model-that-scores-56-22-on-swe-pro-and-57-0-on-terminal-bench-2/)

### MiniMax M2.5 — speed: 0.70 → 0.82

M2.5 is served natively at 100 tokens per second — nearly twice the rate of other frontier models. End-to-end runtime decreased by 37% through improvements like parallel tool calling.

Sources:
- [MiniMax — M2.5 announcement](https://www.minimax.io/news/minimax-m25)

### Kimi K2.5 — vision: 0.73 → 0.82, code: 0.84 → 0.86

MMMU Pro: 78.5%. MathVision: 84.2%. VideoMMMU: 86.6%. BrowseComp: 74.9% (78.4% with agent swarm). These are competitive with frontier multimodal models.

Sources:
- [Moonshot AI — Kimi K2.5 Tech Blog](https://www.kimi.com/blog/kimi-k2-5)
- [Complete Performance Analysis — Kimi K2.5 vs GPT, Claude, Gemini](https://kimi-k25.com/blog/kimi-k2-5-benchmark)

### Llama 4 Maverick — vision: 0.75 → 0.82, code: 0.80 → 0.84

MMMU: 73.4% (beats GPT-4o at 69.1%). MathVista: 73.7% (beats GPT-4o at 63.8%). LiveCodeBench: 43.4% (beats GPT-4o at 32.3%). Natively multimodal with early fusion, supporting up to 8 images per prompt.

Sources:
- [Llama 4 — Meta AI Blog](https://ai.meta.com/blog/llama-4-multimodal-intelligence/)
- [Llama 4 — Official site](https://www.llama.com/models/llama-4/)
- [Artificial Analysis — Llama 4 Maverick](https://artificialanalysis.ai/models/llama-4-maverick)

### IBM Granite 3.3 — code: 0.75 → 0.78, extract: 0.78 → 0.80

Granite 3.3 8B's MATH500 performance puts it ahead of Claude 3.5 Haiku (64.2%) and Llama 3.1 8B (44.4%), roughly in line with the 24B-parameter Mistral Small 3. Strong function calling, fill-in-the-middle coding, and RAG capabilities with dedicated LoRA adapters.

Sources:
- [IBM — Granite 3.3 8B Instruct — HuggingFace](https://huggingface.co/ibm-granite/granite-3.3-8b-instruct)
- [IBM — Granite 3.3 announcement](https://www.ibm.com/new/announcements/ibm-granite-3-3-speech-recognition-refined-reasoning-rag-loras)
- [Signal65 — Granite Benchmarking](https://signal65.com/wp-content/uploads/2025/02/Signal65-Validation_IBM-Granite-Benchmarking-and-Enterprise-Readiness.pdf)

### Gemini 3 Flash — code: 0.85 → 0.88

Gemini 3 Flash scored 78% on SWE-bench Verified — actually outperforming Gemini 3 Pro (76.2%) on coding tasks.

Sources:
- [Google — Gemini 3 Flash Preview](https://designforonline.com/ai-models/google-gemini-3-flash-preview/)

### Gemini 3.1 Pro — analyse: 0.90 → 0.93

GPQA Diamond: 94.3%. ARC-AGI-2: 77.1% (more than double Gemini 3 Pro). This justifies a very high analysis score.

Sources:
- [Google — Gemini 3.1 Pro announcement](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/)
- [Google DeepMind — Gemini 3.1 Pro Model Card](https://deepmind.google/models/model-cards/gemini-3-1-pro/)

### Qwen 3.5 397B — code: 0.80 → 0.85

LiveCodeBench v6: 83.6%. SWE-bench Verified: 76.4%. AIME 2026: 91.3%. Natively multimodal with early fusion. 201 languages supported (up from 119 in Qwen 3). 60% cheaper to run than its predecessor.

Sources:
- [VentureBeat — Alibaba's Qwen 3.5](https://venturebeat.com/technology/alibabas-qwen-3-5-397b-a17-beats-its-larger-trillion-parameter-model-at-a)
- [Qwen — Qwen3.5 Blog](https://qwen.ai/blog?id=qwen3.5)

---

## What we don't know

We try to be honest about the limits of our data:

- **Quality scores are estimates** — task fitness is our weakest signal. It's informed by benchmarks, but benchmarks don't capture everything. As we collect outcome data from real Bearing users, these scores will improve. The strongest signal here is now the routed-run data — Trio and Challenger runs pair a blind LLM-judge verdict with the user's own preference on the same task, giving a per-task win/loss record between specific models that benchmarks can't provide.
- **Sustainability data is sparse** — most providers don't publish per-query energy consumption. Google and GreenPT are exceptions. For many models, we're making informed estimates from model architecture and provider commitments.
- **Pricing changes frequently** — we sync from OpenRouter where possible, but some models are priced outside that ecosystem. Check the provider's own pricing page for the latest.
- **Benchmarks have limitations** — SWE-bench, MMMU, GPQA, and others are useful signals but don't perfectly predict real-world performance on your specific task. That's why Bearing also includes Compare mode for direct testing.

---

## How to suggest corrections

If you spot an error in our ratings or have a better source for a specific data point, please [open an issue on GitHub](https://github.com/dataforaction-tom/bearing/issues) with the model name, the score you think is wrong, and a link to the evidence. We review every suggestion.
