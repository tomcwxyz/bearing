# Agentic work: evidence and assessment (v1 proposal)

Bearing recognises `agentic` as a task type, distinct from the existing `is_agentic` classifier signal and `tools` / `computer_use` capabilities. The flag describes how a task is executed; the task type describes what is being requested. Both may coexist.

## Assessment dimensions

- **tool_use**: appropriate tool selection and valid arguments
- **multi_step_execution**: success over connected actions
- **recovery**: recovery from failed or unexpected tool results
- **context_management**: retention and use of relevant state
- **instruction_adherence**: following permissions and constraints
- **completion_judgement**: stopping, escalating or requesting clarification appropriately

Time, token cost and successful completion cost remain separate measurements, not a hidden component of a quality score.

## Evidence contract

`src/lib/agent-evidence.ts` defines version 1. An observation includes model slug, workflow, dimension, score (0–1 or null), source, benchmark, snapshot date, methodology, harness, sample size and confidence. **Null means not assessed.** A missing observation must never be silently treated as 0 or 0.5.

Benchmark observations must record the harness and task set where known. SWE-bench Verified, τ-bench and GAIA assess different agent configurations; their headline numbers must not be directly averaged into a universal score. Benchmark licensing and permitted reuse must be checked before ingesting any results.

## Compatibility and rollout

1. Add task classification and evidence vocabulary without generating estimated agent ratings.
2. Collect reviewed observations and benchmark provenance, including harness-specific results.
3. Add recommendation logic only when there is adequate comparable evidence. Until then display insufficient evidence and fall back transparently to existing factors.
4. Publish a separately versioned open evidence dataset. Do not silently change existing /api/dataset v2.1 CSV columns.
5. Test classifier, ranking, admin forms, dataset export and docs before merging.

No agent performance grades have been inferred for the existing catalogue.
