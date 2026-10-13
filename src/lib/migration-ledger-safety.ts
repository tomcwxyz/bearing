/** Presence proves a migration might already have run, not that its full SQL succeeded. */
export type MigrationSchemaPresence = {
  has_034: boolean
  has_035: boolean
  has_036: boolean
  has_037: boolean
}

const SIGNATURES: ReadonlyArray<readonly [keyof MigrationSchemaPresence, string]> = [
  ['has_034', '034_benchmark_refresh_runs.sql'],
  ['has_035', '035_model_availability_history.sql'],
  ['has_036', '036_model_retirement.sql'],
  ['has_037', '037_reviewed_model_evidence.sql'],
]

/** Fail closed instead of replaying an untracked, potentially partial migration. */
export function findUntrackedSchemaMigrations(
  applied: ReadonlySet<string>,
  presence: MigrationSchemaPresence,
): string[] {
  return SIGNATURES
    .filter(([signature, filename]) => presence[signature] && !applied.has(filename))
    .map(([, filename]) => filename)
}
