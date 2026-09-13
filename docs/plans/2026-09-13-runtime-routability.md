# Runtime routability canaries

Date: 2026-09-13

## Why this exists

Catalogue presence is not the same thing as executable availability. A model can still appear in OpenRouter or a provider catalogue while its runtime route is broken, retired, misconfigured or temporarily unhealthy.

Bearing now keeps runtime evidence separate from catalogue freshness.

## Evidence model

Migration `028_model_routability.sql` creates a small `model_routability` table keyed by model slug.

Statuses are:

- `unknown` — no runtime observation yet;
- `healthy` — a minimal real completion request succeeded;
- `degraded` — the probe failed, but the failure does not establish that the model itself is unavailable;
- `unavailable` — the execution endpoint explicitly reported that the model is absent/unavailable, or returned a model-route 404.

The row also records the last check time, source, explanatory note and consecutive failure count.

This deliberately does **not** change the model's catalogue verification status, accepted metadata or `active` flag.

## Conservative failure semantics

A temporary provider problem must not turn into a false model-removal signal.

The canary therefore treats these as `degraded`, not `unavailable`:

- rate limiting (`429`);
- provider/server errors (`5xx`);
- authentication or environment configuration problems (`401` / `403` / missing API key);
- network failures;
- unknown request-format failures.

Only explicit model-not-found / model-unavailable evidence becomes `unavailable`.

## Probe path

The scheduled canary considers active chat models only and follows Bearing's normal execution precedence:

1. OpenRouter when the model has an `openrouter_id`;
2. direct provider when Bearing has a direct-provider route;
3. otherwise skip the model because Bearing cannot execute it today.

Each probe sends a minimal `Reply with OK.` completion with `max_tokens: 1`. Probes run sequentially to reduce burst traffic and false rate-limit signals.

## Scheduling

`/api/admin/routability-verify` is protected by `CRON_SECRET` and scheduled daily at 05:00 UTC, after the existing weekly EcoLogits and catalogue jobs.

The endpoint returns aggregate counts only; detailed observations are persisted in the database.

## Deployment

Apply migration `028_model_routability.sql` before expecting the scheduled job to persist observations.

The existing recommendation and execution paths remain deploy-safe before the migration because this slice does not yet use runtime state as a routing hard gate.

## Next steps

1. Run the first production canary and inspect the baseline rather than assuming every failure is meaningful.
2. Add admin visibility for current runtime state and age.
3. Once the baseline is trustworthy, make auto-routing skip **recent explicitly-unavailable** routes while continuing to allow `degraded` routes.
4. Feed runtime health into recommendation evidence/confidence as a distinct dimension from catalogue freshness.
5. Consider cheaper provider-native health endpoints where they exist, while retaining a real completion canary for routes whose catalogue presence is not enough.
