# Bearing 1.0 — freshness implementation

**Status:** In progress  
**Started:** 2026-09-13  
**Parent roadmap:** `docs/plans/2026-09-13-bearing-1-reorientation.md`

## What this slice does

Bearing's recommendation can only be as trustworthy as its model catalogue. This slice turns the freshness schema introduced in migration 026 into an operational subsystem rather than passive metadata.

### Verification behaviour

The first catalogue adapter is OpenRouter because Bearing already uses it for model discovery and execution.

For every **active** Bearing model with an `openrouter_id`, the verifier checks:

- whether the OpenRouter model id still exists;
- published input/output pricing;
- context window;
- capabilities OpenRouter can actually observe from modality and supported parameters.

It records one of four statuses:

- `current` — mapped model is present and the observable metadata still agrees;
- `attention` — mapped model is present but material metadata has drifted;
- `unavailable` — the mapped OpenRouter id is no longer in the catalogue;
- `unknown` — no successful verification has been recorded yet.

Models without an OpenRouter mapping are counted as **unmapped**, not marked unavailable. Their status should eventually be handled by direct-provider catalogue adapters.

## Deliberately observational

The verification pass does **not** silently change:

- active/draft state;
- pricing;
- context window;
- capabilities;
- task-fitness or factor scores.

Material differences are written into `verification_note` and surfaced for review. This prevents a third-party catalogue change from silently changing Bearing's recommendation behaviour.

Pricing already has a separate explicit sync action. Future provider adapters can identify fields safe enough to automate with provenance.

## Admin experience

The Models tab now shows:

- verification state;
- verification age;
- the latest drift/unavailability note on hover;
- linked-model and attention counts;
- a **Verify catalogue** button for an immediate check.

The admin screen degrades gracefully if migration 026 has not yet been applied, rather than making the whole admin route fail.

## Automation

`/api/admin/catalogue-verify` runs the same shared verification service as the admin button and is protected by `CRON_SECRET`.

Vercel schedule:

- EcoLogits refresh: Mondays 03:00 UTC;
- OpenRouter catalogue verification: Mondays 04:00 UTC.

A failed OpenRouter fetch results in no catalogue observations being written, avoiding a partial false-unavailable state.

## Architecture

This slice intentionally does not add more code to the existing large `src/app/admin/actions.ts` or `src/lib/db.ts` modules.

New boundaries:

```text
src/db/model-verification.ts          database projection + batch persistence
src/lib/catalogue-verification.ts     pure comparison / drift logic
src/lib/verify-catalogue.ts           shared orchestration service
src/app/admin/freshness-actions.ts    authenticated admin action
src/app/api/admin/catalogue-verify/   scheduled endpoint
```

This is also the first small move towards the feature/repository architecture in the Bearing 1.0 roadmap.

## Next freshness steps

1. Apply migration 026 to the production Neon database if it is not already present.
2. Run the first verification pass and review `attention` / `unavailable` rows.
3. Add provider-primary adapters for OpenAI, Anthropic, Google and Mistral so direct-provider models can be verified independently of OpenRouter.
4. Separate **catalogue presence** from **runtime routability** and add a lighter daily executable-model canary.
5. Feed freshness into recommendation confidence; do not make stale metadata a hidden ranking penalty.
6. Add safe, provenance-backed approval flows for accepting pricing/context/capability drift.
