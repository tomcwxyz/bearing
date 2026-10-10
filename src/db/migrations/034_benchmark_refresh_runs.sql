-- 034: Each benchmark subset has its own durable refresh outcome.
-- An interrupted function leaves a running record which the UI identifies as stale.
CREATE TABLE IF NOT EXISTS benchmark_refresh_runs (
  id text PRIMARY KEY,
  source text NOT NULL,
  subset text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  fetched int,
  inserted int,
  duplicates_removed int,
  conflicting_keys int,
  snapshot_date date,
  error text,
  CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR (status IN ('succeeded','failed') AND completed_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_benchmark_refresh_source_subset
  ON benchmark_refresh_runs(source, subset, started_at DESC);
