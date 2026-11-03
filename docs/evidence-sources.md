# Evidence sources

Bearing draws on external evaluations and curated assessments to help compare AI models for particular jobs. This page identifies the principal external sources, what each contributes, and the limits of that evidence.

For how evidence affects recommendations, read [How we rate models](model-ratings.md). **A source being listed here does not mean every model has a current observation from it, or that its scores automatically affect production rankings.**

| Source | What we use it for | Important limitations | Freshness |
| --- | --- | --- | --- |
| [Artificial Analysis](https://artificialanalysis.ai/) | Model evaluations, coding, mathematics, latency and throughput signals | Test conditions, model variants, providers and measurement dates differ; performance depends on deployment | Check the observation's source timestamp; no universal refresh interval is claimed |
| [LMArena](https://lmarena.ai/) | Human preference comparisons across categories | Preference samples and arena prompts may not match a particular user's task; rankings and cohorts change | Check the source leaderboard and dated observations |
| [LiveBench](https://livebench.ai/) | Task-oriented benchmark evidence designed to reduce contamination | Benchmark tasks are proxies for real work; coverage and model variants vary | Check the published evaluation version/date |
| [MTEB](https://huggingface.co/spaces/mteb/leaderboard) | Embedding and retrieval model quality evidence | Dataset, language, retrieval setting and evaluation configuration matter; not interchangeable with chat-model quality | Check the leaderboard entry and evaluation date |
| [EcoLogits](https://ecologits.ai/) | Environmental estimates for supported inference-related sustainability fields | Estimates depend on assumptions, model coverage and deployment context; not a measured full life-cycle footprint | Check the evidence provenance and model coverage |

## How Bearing interprets evidence

- **Task relevance:** External benchmark categories are mapped to Bearing's task types; a strong aggregate leaderboard result is not a guarantee for a specific job.
- **Model identity:** Source aliases and variants must be matched to canonical model records. Ambiguous variants need review.
- **Provenance:** Keep source, source-side model name, variant, observation date and evidence type where available. Missing values remain unknown, not zero.
- **Disagreement:** Curated and benchmark evidence can disagree. That disagreement should be visible as uncertainty, not silently erased.
- **Ranking safeguards:** The methodology currently documents `BENCHMARK_BLEND=0` as the production default. External evidence informs inspection, confidence and shadow evaluation rather than automatically changing production scores.
- **Availability:** A model's runtime or catalogue availability is a separate operational signal from benchmark quality.

## Freshness and coverage

This is a **source directory**, not a live ingestion-status dashboard. It does not claim that any particular feed ran successfully today. To report actual freshness, a future live view should derive per-source *last successful ingestion*, *last observation*, *number of matched models*, *unmatched variants*, and *failure state* from persisted ingestion records, with timestamps in UTC. Do not infer ingestion freshness from the date this document was edited.

## Licensing and reuse

The sources have their own terms, licences and attribution requirements. A public leaderboard does not necessarily authorise redistribution of its underlying dataset or commercial reuse. Review the relevant provider's terms before exporting, mirroring or publishing source-derived values. Bearing's [public data documentation](public-data.md) explains the distinction between its published decision records and upstream evidence.

## Corrections and challenges

Found an outdated model variant, questionable score or missing source? [Contribute model evidence](model-evidence-contributions.md) or [open an issue](https://github.com/tomcwxyz/bearing/issues/new/choose). Proposed changes are reviewed rather than automatically promoted to the live catalogue.
