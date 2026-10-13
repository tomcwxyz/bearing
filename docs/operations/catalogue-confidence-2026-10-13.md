# Catalogue confidence: operational review — 13 October 2026

This is a **source-and-evidence review**, not authorisation to silently rewrite rankings. Source observations, route execution and model identity are separate. Run the authenticated model verification before using the queue and keep the original observations and review decisions.

## Production snapshot

Read-only queries against Bearing's production Neon project showed 82 models: **80 live, 2 retired**. Of the live catalogue: **55 current, 10 attention, 1 unavailable, 14 unknown**. The most recent catalogue verification was 12 October 2026 at 04:00 UTC. The independent LMArena Text, WebDev and Vision refreshes succeeded later that morning. The latest snapshot dates in stored evidence were 9 October (LMArena) and 12 October (Artificial Analysis and EcoLogits). These are *source dates*, not necessarily freshness of each individual metric or the current live execution route.

## Priority review: route availability

- **`qwen3-235b-a22b`**: OpenRouter no longer listed `qwen/qwen3-235b-a22b` on 12 October. Investigate route retirement, replacement and any real provider-native path. Do not overwrite the canonical model with `qwen/qwen3-235b-a22b-2507`: that is a separately versioned model. After confirmation and historical review, use Bearing's audited retirement flow rather than deleting records.
- **Two retired models** (`grok-4`, `devstral`) must remain out of active recommendations; their historical observations must remain available. Existing retirement state is not a licence to remove evidence.

## Metadata differences requiring editorial review

| Model | Observed discrepancy on 12 October | Decision needed |
| --- | --- | --- |
| DeepSeek R1 | Context 128,000 → 64,000 | Check the *same* route/variant and accepted context semantics |
| DeepSeek V4 Pro | Input/output token prices changed slightly | Verify pricing units and route; update if confirmed |
| Gemma 3 27B | Context 262,144 → 131,072 | Resolve provider-route vs model-native limit |
| GPT-5.4 | Context 272,000 → 1,050,000 | Verify route and API context interpretation |
| Kimi K2.6 | Input/output token prices increased | Review against the live execution route |
| Kimi K3 | Input price increased; output price reduced | Review against the live execution route |
| MiniMax M2.5 | Context 1,000,000 → 204,800; vision disappeared | Treat lost capability as high impact; verify variant |
| MiniMax M2.7 | Context 1,000,000 → 204,800; vision disappeared | Treat lost capability as high impact; verify variant |
| Nemotron 3 Ultra | Prices increased; context 512,288 → 262,144 | Review both cost and context |
| Qwen 2.5 72B | Context 128,000 → 32,768 | Confirm route limit before updating |

The differences above are from Bearing's persisted OpenRouter observations, **not** an independent adjudication. Some changes affect hard capability gates and should be reviewed first. On the admin catalogue review page, selected values can be accepted only after a fresh server-side check. When evidence is conflicting or the model variant is ambiguous, leave the value for review and document the reason rather than automatically accepting all.

## The 14 models with missing catalogue verification

Unknown is **not** the same as unavailable. No current supported catalogue response matched them:

- **OpenAI embeddings:** `openai-embed-3-small`, `openai-embed-3-large`. Provider IDs are present; confirm that a configured `OPENAI_API_KEY` enables native listing and that embedding IDs appear in the response.
- **Mistral:** `mistral-embed-2`, `mistral-ocr`. Check current product identity before adding provider IDs; OCR is not interchangeable with a chat/Pixtral variant.
- **GreenPT:** `greenpt-greenl`, `greenpt-greenr`, `greenpt-green-embedding`. Seek native or documented local evidence rather than inventing OpenRouter IDs.
- **Liquid:** `lfm-2-24b-a2b`. Seek vendor/local route evidence.
- **Cohere:** `cohere-embed-v4`. Implement native catalogue evidence if supported.
- **Voyage AI:** `voyage-3-large`, `voyage-3-lite`. Implement native catalogue evidence if supported.
- **Open embedding weights:** `bge-m3`, `nomic-embed-v2-moe`, `gte-qwen2-7b`. Verify model artefact and variant with maintained source evidence; a hosted-route check may be inappropriate.

Follow issue [#116](https://github.com/tomcwxyz/bearing/issues/116) for the four originally listed unmapped chat/OCR cases. Extend verification adapters by **source family**, with tests for empty catalogues, missing keys, provider outages and absent model identifiers. Fail *unknown* on missing evidence, never *unavailable*. Do not equate metadata checks with an actual inference canary.

## Routine

1. Open Admin → Models → Live; run Verify all (or Verify selected for a small batch). Confirm checked/targeted counts, source failures and unverified model list.
2. Open Catalogue review for drift and route warnings. Verify material changes with source-specific documentation and, where relevant, a real routed run before accepting.
3. Keep separate **catalogue-current**, **route-routable** and **benchmark-fresh** statuses; report degraded jobs visibly instead of claiming green from partial coverage.
4. Retire only with positive evidence across relevant routes, written reason and audit record. Never delete the model or its historic scores, and never promote a retired record back into a draft implicitly.
5. Check refresh runs, snapshot dates, duplicates removed and unmatched benchmark names. A successful ingestion does not mean every live model has external benchmark coverage.
6. Log reviewed-but-rejected drift explicitly once the keep-current review audit from issue [#113](https://github.com/tomcwxyz/bearing/issues/113) is implemented. Until then, retain a dated explanation outside the application.

A weekly check should report **coverage** (verified/targeted plus unverified), source failure/degraded status, drift requiring action and oldest important benchmark. Treat an unverified live model as unverified, not healthy. The 12 October 2026 checks are the baseline for following up.

**Change policy:** Do not apply any production model-data changes as part of this documentation or automated migration review; decisions must be auditable.
