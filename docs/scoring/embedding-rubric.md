# Embedding Model Rubric

`task_fitness.embedding` is a curated 0–1 score per embedding model stored in `src/data/bearing-registry.json`. It feeds the "quality" factor for `task_type = 'embedding'` recommendations.

## How embedding quality is scored

Unlike chat models, embedding model quality is anchored to a single external leaderboard:
**MTEB (Massive Text Embedding Benchmark)** — a standardised suite of 56+ retrieval, STS, classification, and clustering tasks. We use the MTEB Overall average as a proxy for general-purpose embedding quality.

### Score anchors

| Range | Meaning | Example |
|---|---|---|
| 0.90–1.00 | Best-in-class MTEB; flagship precision retrieval | voyage-3-large (MTEB ~73) |
| 0.80–0.89 | Strong; excellent for most production retrieval | openai-embed-3-large, cohere-embed-v4 |
| 0.70–0.79 | Balanced; good retrieval with lower cost or latency | openai-embed-3-small, bge-m3 |
| 0.60–0.69 | Budget / local; fine for semantic similarity | voyage-3-lite, nomic-embed-v2 |
| <0.60 | Niche or outdated; avoid for new builds | — |

### Normalisation

Raw MTEB Overall scores are normalised linearly within the embedding-model cohort using min-max scaling. The current cohort min is ~62 and max is ~73, so a small absolute difference translates to a larger normalised score difference.

The `BENCHMARK_BLEND` environment variable (default 0) controls how much weight the ingest score gets vs the curated value. A blend of 0.3–0.5 is reasonable once the cohort grows to 20+ models.

## When to pick embedding vs similar task types

| Situation | Pick |
|---|---|
| You need to store text as vectors for semantic search or retrieval | **embedding** |
| You need to extract structured fields from a document | **extract** — produces structured text, not vectors |
| You need to answer a question using retrieved context | **research** or **qa** — the retrieval layer uses embeddings, but the LLM stage is research/qa |
| Your pipeline has an "index documents" stage | **embedding** — even if the downstream stage is summarise or qa |

## Model class routing

The `model_class` field (values: `"chat"`, `"embedding"`) gates which models appear in results:

- Tasks with `task_type = 'embedding'` hard-reject all `model_class = 'chat'` models (`reason = 'wrong_class'`).
- All other task types hard-reject `model_class = 'embedding'` models.
- Class routing runs before capability gates (vision, tools, etc.), so the rejection reason for a cross-class pair is always `wrong_class`.

## Local / open-weight embedding models

The three open-weight embedding models in the registry (`bge-m3`, `nomic-embed-v2-moe`, `gte-qwen2-7b`) carry `local_info` entries listing recommended hardware tiers. They can be served with Ollama, llama.cpp, or the `sentence-transformers` library.

## Benchmark source

Muennighoff, N., Tazi, N., Magne, L., & Reimers, N. (2023). MTEB: Massive Text Embedding Benchmark. *arXiv:2210.07316*. MIT Licence.

MTEB results are published as `mteb/results` on Hugging Face Hub. Scores cited per-model are taken from the model card or official leaderboard submission. Ingest script: `scripts/ingest-mteb.ts`.
