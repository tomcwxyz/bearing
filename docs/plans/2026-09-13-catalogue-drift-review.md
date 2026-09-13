# Catalogue drift review workflow

Date: 2026-09-13

## Why this slice exists

Bearing can now observe provider-native and OpenRouter catalogue drift, but an `attention` status by itself is not enough. The admin needs a safe way to see exactly what changed and deliberately accept metadata updates without allowing a catalogue outage or disappearance to silently alter routing behaviour.

This slice adds the first review/accept loop.

## Behaviour

The admin model list links to `/admin/catalogue-review`.

The review page re-fetches live catalogue evidence and turns disagreements into field-level proposals for:

- input price;
- output price;
- context window;
- externally observable capabilities.

Provider-native metadata wins for fields a provider catalogue actually exposes. OpenRouter fills broader pricing and capability gaps. Capabilities Bearing curates but the external sources cannot observe are preserved.

Availability is intentionally separate. A provider/OpenRouter disappearance is shown as an availability concern, but there is no automatic deactivation or one-click acceptance that changes active state.

## Accepting drift

The browser submits only the model slug and selected field names. Proposed values are never trusted from the client.

Before applying a change the server:

1. checks the user is an admin;
2. re-fetches current provider/OpenRouter evidence;
3. rebuilds the current drift proposal;
4. applies only fields that are both selected and still drifting;
5. resets catalogue confidence to `unknown` while the row changes;
6. runs catalogue verification again.

If the re-verification source fails after the accepted update, Bearing remains safely at `unknown` rather than retaining a stale `attention` observation against metadata that has already changed.

## Mapping preservation fix

The generic model upsert previously set `openrouter_id = EXCLUDED.openrouter_id`. Editorial admin forms do not carry catalogue IDs, so a normal edit could overwrite an existing mapping with null.

Generic upserts now use:

```sql
openrouter_id = COALESCE(EXCLUDED.openrouter_id, models.openrouter_id)
```

Intentional mapping changes and clears remain the responsibility of the dedicated external-ID persistence path.

## Next steps

- Capture reviewer/audit history rather than only the latest verification state.
- Add a deliberate keep-current / dismiss-with-reason path for differences that Bearing chooses not to adopt.
- Expand provider metadata adapters where first-party APIs expose pricing or richer capability metadata.
- Add runtime routability canaries so catalogue presence and actual executable availability are tracked separately.
- Use the reviewed freshness/evidence layer when redesigning alternatives, challenger selection and task-relative capability scoring.
