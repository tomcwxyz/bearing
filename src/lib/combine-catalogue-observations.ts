import type { VerificationObservation } from '@/db/model-verification'

/** A confirmed alternative route means missing provider-native route is a
 * review issue, rather than evidence that the model is wholly unavailable. */
export function combineCatalogueObservations(
  openRouter: VerificationObservation[],
  native: VerificationObservation[],
): VerificationObservation[] {
  const chosen = new Map(openRouter.map(item => [item.slug, item]))
  for (const observation of native) {
    const fallback = chosen.get(observation.slug)
    if (observation.status === 'unavailable' && fallback?.status === 'current') {
      chosen.set(observation.slug, {
        ...observation,
        status: 'attention',
        note: `${observation.note ?? 'Native route unavailable'} OpenRouter still lists this model; review route identifiers before considering retirement.`,
      })
    } else {
      chosen.set(observation.slug, observation)
    }
  }
  return [...chosen.values()]
}
