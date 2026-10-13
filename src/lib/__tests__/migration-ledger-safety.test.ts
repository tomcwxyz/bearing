import { describe, expect, it } from 'vitest'
import { findUntrackedSchemaMigrations, type MigrationSchemaPresence } from '@/lib/migration-ledger-safety'

const present: MigrationSchemaPresence = {
  has_034: true,
  has_035: true,
  has_036: true,
  has_037: false,
}

describe('migration ledger/schema mismatch guard', () => {
  it('blocks schema objects whose migration is not recorded', () => {
    expect(findUntrackedSchemaMigrations(new Set(['024_password_auth.sql']), present)).toEqual([
      '034_benchmark_refresh_runs.sql',
      '035_model_availability_history.sql',
      '036_model_retirement.sql',
    ])
  })

  it('does not flag a complete ledger or nonexistent schema', () => {
    const applied = new Set([
      '034_benchmark_refresh_runs.sql',
      '035_model_availability_history.sql',
      '036_model_retirement.sql',
    ])
    expect(findUntrackedSchemaMigrations(applied, present)).toEqual([])
    expect(findUntrackedSchemaMigrations(new Set(), {
      has_034: false, has_035: false, has_036: false, has_037: false,
    })).toEqual([])
  })

  it('protects reserved migration 037 once its audit table exists', () => {
    expect(findUntrackedSchemaMigrations(new Set(), { ...present, has_037: true })).toContain(
      '037_reviewed_model_evidence.sql',
    )
  })
})
