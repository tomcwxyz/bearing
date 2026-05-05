# Task Fitness Rubric

`task_fitness` is a curated 0–1 score per `(model, task_type)` pair stored in `src/data/bearing-registry.json`. It feeds the "quality" factor in our recommendation scoring, so it directly controls whether frontier models surface for hard tasks. Historically TF values clustered in a narrow 0.7–0.9 band, which flattened the dynamic range and let cheap models edge out frontier ones on complex work. This rubric exists so re-grades are consistent across the registry and so future model additions have an anchor.

## Score anchors

| Range | Meaning |
|---|---|
| 0.95–1.00 | Best-in-class on this task type, definitively SoTA |
| 0.88–0.94 | Strong frontier — very close to SoTA, but not the leader |
| 0.78–0.87 | Capable balanced/mid-tier — solid for medium complexity |
| 0.65–0.77 | Budget tier — fine for simple tasks, struggles on complex |
| 0.50–0.64 | Weak / specialist mismatch |
| <0.50 | Don't recommend for this task type |

## Per-task anchors

These are illustrative, not exhaustive — 3–4 reference points per task type. When grading a new model, find the closest anchor and adjust.

### `code`
- 0.96: Claude Opus 4.6, GPT-5.4 (Aider/SWE-Bench leaders)
- 0.93: Claude Sonnet 4.6
- 0.91: Gemini 3.1 Pro
- 0.82: Gemini 3 Flash, Llama 4 Maverick
- 0.70: IBM Granite, Mistral Small

### `analyse`
- 0.95: Claude Opus 4.6, GPT-5.4 (deep reasoning, long-context synthesis)
- 0.90: Claude Sonnet 4.6, Gemini 3.1 Pro
- 0.80: Gemini 3 Flash, GPT-5.4 mini
- 0.68: Llama 4 Scout, Mistral Small

### `generate`
- 0.94: Claude Opus 4.6, GPT-5.4 (long-form prose, creative writing)
- 0.89: Claude Sonnet 4.6
- 0.80: Gemini 3 Flash, Llama 4 Maverick
- 0.70: Mistral Small, Granite

### `summarise`
- 0.93: Claude Sonnet 4.6, GPT-5.4 (faithful, concise, low hallucination)
- 0.88: Gemini 3.1 Pro, Claude Haiku 4.6
- 0.80: Gemini 3 Flash, GPT-5.4 mini
- 0.70: Llama 4 Scout

### `extract`
- 0.93: GPT-5.4, Claude Sonnet 4.6 (structured output, schema adherence)
- 0.88: Gemini 3.1 Pro, Claude Haiku 4.6
- 0.80: Gemini 3 Flash, GPT-5.4 mini
- 0.68: Mistral Small

### `translate`
- 0.92: GPT-5.4, Gemini 3.1 Pro (broad language coverage, idiom handling)
- 0.87: Claude Sonnet 4.6, Gemini 3 Flash
- 0.78: Llama 4 Maverick
- 0.65: Granite, smaller specialists

### `conversation`
- 0.93: Claude Sonnet 4.6, GPT-5.4 (tone, steerability, multi-turn coherence)
- 0.88: Claude Haiku 4.6, Gemini 3.1 Pro
- 0.80: Gemini 3 Flash, Llama 4 Maverick
- 0.70: Mistral Small

### `vision`
- 0.93: GPT-5.4, Gemini 3.1 Pro (chart/diagram reasoning, OCR, spatial)
- 0.88: Claude Opus 4.6, Claude Sonnet 4.6
- 0.78: Gemini 3 Flash
- 0.50: text-only models (use `unknown_default` if unsure)

## Rules of thumb

- The same model gets DIFFERENT TF scores per task — Codestral might be 0.92 on `code` and 0.45 on `generate`. Don't average a model into one number.
- When in doubt, anchor against an existing model in the same band rather than inventing a number.
- Keep tier-tier gaps meaningful: a flagship should usually beat a balanced model by ≥0.10 on its strong tasks. If the gap is <0.05 the rubric isn't doing its job.
- If a model lacks coverage for a task type, set the field to its `unknown_default` (the registry already has 0.5 as a fallback) — DON'T leave it absent.

## Pointers

See `src/lib/scoring.ts` for how this is used in scoring; see `docs/plans/2026-05-05-recommendation-tuning.md` Phase 1 for the re-grading work this rubric supports.
