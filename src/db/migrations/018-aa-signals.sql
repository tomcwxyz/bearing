-- 018: Artificial Analysis ingestion + non-task signal types
--
-- AA publishes per-model `evaluations` (intelligence/coding/math indices,
-- mmlu_pro, gpqa, livecodebench, etc.) which slot into the existing
-- task-mapped pipeline, plus throughput (`median_output_tokens_per_second`)
-- and latency (`median_time_to_first_token_seconds`) signals which do not.
--
-- We ride the existing benchmark_snapshots table for both, distinguished by
-- a new signal_type column. Default 'task' keeps existing rows correct.
--
-- Wrapped in a single DO block because the Neon serverless driver rejects
-- multi-statement DDL in one call.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'benchmark_snapshots' AND column_name = 'signal_type'
  ) THEN
    ALTER TABLE benchmark_snapshots
      ADD COLUMN signal_type TEXT NOT NULL DEFAULT 'task';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'benchmark_snapshots_signal_type_check'
  ) THEN
    ALTER TABLE benchmark_snapshots
      ADD CONSTRAINT benchmark_snapshots_signal_type_check
      CHECK (signal_type IN ('task', 'speed', 'latency'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_benchmark_snapshots_perf'
  ) THEN
    CREATE INDEX idx_benchmark_snapshots_perf
      ON benchmark_snapshots(bearing_slug, signal_type)
      WHERE bearing_slug IS NOT NULL AND signal_type <> 'task';
  END IF;
END
$migration$;
