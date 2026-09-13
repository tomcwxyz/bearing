# Provider-primary catalogue verification

## Problem

OpenRouter gives Bearing broad catalogue coverage, but it is not a complete source of truth. At the start of this work 21 of 61 active Bearing models had no `openrouter_id`, including direct-provider models and embedding/specialist models.

Freshness should therefore be source-aware rather than synonymous with OpenRouter.

## Design

Bearing now supports an explicit nullable `provider_model_id` alongside `openrouter_id`.

The identifier is intentionally explicit. We do not derive provider IDs from Bearing slugs or display names: a wrong mapping is worse than an unknown freshness state.

Verification source precedence is:

1. a successful provider-native catalogue check for an explicitly mapped `provider_model_id`;
2. OpenRouter when an `openrouter_id` is available;
3. no observation / existing evidence remains untouched when neither source can safely verify the model.

A provider request failing is **not** evidence that every model disappeared. Failed providers are recorded in the run report and produce no `unavailable` observations.

## Supported provider adapters

The first adapter layer supports:

- Anthropic (`ANTHROPIC_API_KEY`) — model presence, context window and the provider capabilities that map cleanly to Bearing;
- OpenAI (`OPENAI_API_KEY`) — model presence;
- Mistral (`MISTRAL_API_KEY`) — model presence, context window, vision and function/tool capability where reported;
- Google Gemini (`GEMINI_API_KEY`) — model presence and input-token limit.

Provider credentials are optional. Missing credentials skip that provider rather than failing the full verification run. Anthropic was already part of Bearing's environment; the other keys are documented as optional.

## Seeded mappings

Migration 027 seeds only provider IDs confirmed in current first-party provider documentation:

- `claude-fable-5` → `claude-fable-5`
- `claude-sonnet-5` → `claude-sonnet-5`
- `gpt-5.6-sol` → `gpt-5.6-sol`
- `openai-embed-3-large` → `text-embedding-3-large`
- `openai-embed-3-small` → `text-embedding-3-small`

Everything else remains null until explicitly mapped.

## Admin mapping

`/admin/models/[slug]/identifiers` provides a deliberately small mapping surface for the provider-native ID and OpenRouter ID. The model list shows whether freshness is provider-backed or OpenRouter-backed and links to the identifier editor.

This keeps external routing/catalogue identifiers separate from editorial model metadata.

## Safety semantics

Verification remains observational:

- metadata drift → `attention`;
- a mapped ID absent from a successfully fetched catalogue → `unavailable`;
- source outage / authentication failure → no new observation for that source;
- no automatic deactivation;
- no automatic acceptance of changed pricing, context or capabilities.

Where a provider API exposes only presence (for example OpenAI's model listing), Bearing does not pretend it can verify richer metadata from that endpoint.

## Next steps

1. Apply migration 027 to production after rehearsal and approval.
2. Run the first combined catalogue verification.
3. Review the resulting drift and explicitly map further provider IDs where first-party evidence exists.
4. Add a drift acceptance/rejection workflow so reviewed provider metadata can update the accepted catalogue with an audit trail.
5. Add executable-model canaries as a separate runtime-routability signal; catalogue presence and successful execution are not the same thing.
6. Fix remaining registry freshness gaps revealed by first-party docs rather than silently rewriting them during verification.
