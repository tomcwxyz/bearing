# Production classifier baseline — 2026-09-16

This note records the first live semantic classifier evaluation run against Bearing's production Anthropic classifier. The evaluator uses synthetic fixture descriptions only and reports structured classification evidence; it does not retain user prompts or model prose.

## Baseline

Run: 2026-09-16 13:40 UTC on the production deployment.

- 28 cases
- 26 completed
- 2 structured-output failures
- 362 checked fields
- 292 fields passed
- 80.7% field accuracy
- 83.3% task-type accuracy
- 96.2% clarification accuracy
- average classifier-reported confidence: 0.84

The two failed calls were both pipeline behaviour probes, so the initial run could not report pipeline accuracy. This was a contract/validation issue rather than sufficient evidence that pipeline detection itself was failing.

## Pipeline diagnosis

A focused production rerun at 13:50 UTC showed:

- `pipeline-invoices-to-report`: valid result, `pipeline_recommended=true`, 3 stages, no expected-field failures.
- `pipeline-research-to-comms`: rejected because the model returned a top-level `task_type` outside Bearing's canonical task-type set.

Bearing's runtime validator correctly rejected the invalid structured output.

## Repair

The classifier boundary was hardened so that:

- every request explicitly states that the top-level `task_type` must remain one of Bearing's canonical task types, including for pipeline tasks;
- the top-level type describes the final user-facing deliverable rather than using a compound or `pipeline` label;
- a classifier response that arrives but fails runtime schema validation receives one explicit repair attempt;
- API/network failures are not retried by this mechanism;
- repaired output must still pass the same runtime validator.

## Post-fix verification

A production verification at 14:00 UTC passed both pipeline probes:

- `pipeline-invoices-to-report`: valid, confidence 0.92, `pipeline_recommended=true`, 3 stages, no expected-field failures.
- `pipeline-research-to-comms`: valid, confidence 0.85, `pipeline_recommended=true`, 3 stages, no expected-field failures.

The temporary pipeline diagnostic route and cron were removed after verification. The protected full classifier evaluator remains available for future calibration runs.

## Interpretation

This is a starting baseline, not a release threshold. In particular:

- field accuracy mixes high-value semantic decisions with lower-impact estimates such as input length, output length and latency target;
- reported confidence is the classifier's self-assessment and should not be treated as calibrated probability;
- task-type and clarification performance should be tracked separately from pipeline detection and secondary metadata;
- future runs should compare changes by fixture and decision category rather than optimise a single aggregate percentage.

Before making the live evaluator blocking, collect repeated runs and establish which disagreements represent genuine classifier regressions versus reasonable ambiguity in the fixture expectations.
