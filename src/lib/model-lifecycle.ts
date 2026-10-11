export type ModelLifecycleStatus = 'draft' | 'live' | 'retired'

/** Publication state remains backward-compatible with the existing active gate. */
export function modelLifecycleStatus(
  active: boolean,
  retiredAt: string | Date | null | undefined,
): ModelLifecycleStatus {
  if (retiredAt != null) return 'retired'
  return active ? 'live' : 'draft'
}

export function validateLifecycleSlugs(requested: unknown): string[] {
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 100 ||
    requested.some(slug => typeof slug !== 'string' || !/^[a-zA-Z0-9._/-]{1,140}$/.test(slug))) {
    throw new Error('Select between 1 and 100 valid model identifiers')
  }
  return [...new Set(requested as string[])]
}

export function validateLifecycleReason(reason: unknown): string {
  if (typeof reason !== 'string' || reason.trim().length < 4 || reason.trim().length > 500) {
    throw new Error('Provide a reason between 4 and 500 characters')
  }
  return reason.trim()
}
