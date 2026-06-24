// Single source of truth for model classes. Lives outside registry.ts so
// client components (e.g. the models-list filter pills) can import the
// runtime array without pulling the full registry JSON into the client
// bundle. registry.ts re-exports everything here for server-side callers.

// Splits the registry into generative chat models (the v0.8 set) and
// embedding models (v0.9). Scoring uses this as a hard filter — an
// `embedding` task routes only to `embedding` models, and every other task
// routes only to `chat` models. New chat models added via the admin
// flow default to 'chat'.
export const MODEL_CLASSES = ['chat', 'embedding'] as const

export type ModelClass = (typeof MODEL_CLASSES)[number]

// Narrow an untrusted string (e.g. a ?type= search param) to a ModelClass.
export function isModelClass(value: string | undefined): value is ModelClass {
  return value !== undefined && (MODEL_CLASSES as readonly string[]).includes(value)
}
