// Embedding APIs bill input tokens only (output_per_1m === 0 invariant), and
// input_per_1m === 0 means the model is open-weight / self-hosted. Every page
// that shows an embedding price goes through this helper so the zero-price
// wording and the price threshold can't drift between the models list, the
// model detail page, and the embedding results page.
//
// Registry embedding prices are stored with at most 2 decimal places, so
// toFixed(2) is lossless today; revisit if a sub-cent price is ever added.
export function embeddingPriceLabel(inputPer1M: number, suffix = ''): string {
  if (inputPer1M === 0) return 'Free (self-host)'
  return `$${inputPer1M.toFixed(2)}${suffix}`
}
