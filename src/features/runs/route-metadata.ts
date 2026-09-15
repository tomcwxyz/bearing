export function originalRecommendationRank(
  ranked: Array<{ slug: string }>,
  selectedSlug: string,
): number {
  const index = ranked.findIndex((model) => model.slug === selectedSlug)
  return index >= 0 ? index + 1 : 1
}
