# Production routability baseline — 2026-09-16

This note records the first successful production runtime-canary baseline after scheduled maintenance authentication was enabled in Vercel.

## Run

- **Observed at:** 2026-09-16 08:35:19 UTC
- **Route:** `/api/admin/routability-verify`
- **Vercel result:** HTTP 200
- **Persisted observations:** 42
- **Healthy:** 40
- **Degraded:** 0
- **Unavailable:** 2
- **Normal schedule:** daily at 05:00 UTC

The successful run verifies the full path: Vercel cron authentication → Bearing route → provider probes → `model_routability` persistence.

## Unavailable observations

| Model | Runtime source | Observation | Consecutive failures |
| --- | --- | --- | ---: |
| `devstral` | OpenRouter | explicit HTTP 404 | 1 |
| `grok-4` | OpenRouter | explicit HTTP 404 | 1 |

These are observations, not capability judgements. Both catalogue rows were still active at the time of the run and had not yet been independently verified by catalogue maintenance.

## Routing policy

Do **not** turn this first baseline into a hard routing gate.

A future suppression rule should remain deliberately conservative:

1. only `unavailable` can suppress; `degraded` never can;
2. require repeated explicit unavailability rather than a single probe failure;
3. require a recent observation window;
4. distinguish stale/incorrect endpoint identifiers from a genuinely removed model;
5. keep routability separate from model capability or quality scoring;
6. make suppression reversible automatically when a later canary succeeds;
7. inspect catalogue/provider evidence before changing canonical model metadata.

A sensible next checkpoint is the next scheduled canary. If the same model is explicitly unavailable again, `consecutive_failures` should become 2 and the endpoint/catalogue mapping should be investigated before any production hard gate is enabled.

## Operational follow-up

- Confirm the next unattended 05:00 UTC run succeeds.
- Review `devstral` and `grok-4` against current provider/OpenRouter catalogue evidence.
- Keep the admin Maintenance surface as the manual recovery path.
- Only wire `model_routability` into recommendation/execution filtering after the repeated-failure policy is implemented and tested.
