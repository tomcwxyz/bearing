# Recommendation evidence confidence

## Why this exists

Bearing's recommendation score and Bearing's confidence in the supporting catalogue evidence are different things.

A model can be the best fit for a task based on the information Bearing currently holds while some of that information is stale, disputed, or awaiting review. Folding freshness into the ranking as a hidden penalty would make recommendations harder to explain and could silently move models around for reasons the user cannot see.

Instead, Bearing keeps these concepts separate:

- **recommendation ranking** answers: _given the catalogue data we hold, which model best fits this task and bearing?_
- **evidence confidence** answers: _how current is Bearing's external evidence for the catalogue data behind this model?_

## Confidence states

The results surface derives a small, explicit confidence state from model verification metadata:

| Verification evidence | User-facing confidence | Meaning |
| --- | --- | --- |
| `current`, verified within 7 days | High | Recent external catalogue evidence supports the stored model metadata. |
| `current`, older than 7 days | Medium | The last verification succeeded but is due for refresh. |
| `attention` | Low | Material catalogue metadata drift has been observed and needs review. |
| `unavailable` | Low | The external catalogue could not confirm the model. Bearing does not automatically deactivate it. |
| `unknown` / never verified | Unknown | No current verification evidence is available yet. |

The UI deliberately explains that this is **not** a probability that the model will perform well.

## Architecture

`src/lib/recommendation-evidence.ts` is a pure translation layer from stored freshness metadata to a user-facing evidence object. It does not import or mutate scoring.

The results server page loads the lightweight verification projection from `src/db/model-verification.ts`, derives evidence for only the ranked models, and passes the serialisable result to the client. If verification data cannot be loaded, the results page degrades to `unknown` evidence rather than failing the recommendation journey.

This preserves the boundary established in the freshness subsystem:

1. external verifiers observe catalogue state;
2. observations are persisted as evidence;
3. ranking remains deterministic from the accepted catalogue;
4. users can see when accepted catalogue data is stale or disputed;
5. accepting external drift into the catalogue remains a separate, reviewable action.

## Next steps

1. Run the first full production catalogue verification and use the resulting drift as the baseline.
2. Add provider-primary verification adapters for models that do not have an OpenRouter mapping, starting with OpenAI, Anthropic, Google and Mistral.
3. Distinguish catalogue presence from runtime routability with a lightweight executable-model canary.
4. Add an admin review/accept flow for material drift rather than editing model metadata automatically.
5. Add benchmark/evaluation evidence alongside freshness so recommendation confidence can eventually describe multiple evidence dimensions without collapsing them into a single opaque score.
