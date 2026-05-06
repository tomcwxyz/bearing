-- 018: Artificial Analysis ingestion + non-task signal types
--
-- AA publishes per-model `evaluations` (intelligence/coding/math indices,
-- mmlu_pro, gpqa, livecodebench, etc.) which slot directly into the existing
-- task-mapped pipeline, plus throughput (`median_output_tokens_per_second`)
-- and latency (`median_time_to_first_token_seconds`) signals which do not.
--
-- We ride the existing benchmark_snapshots table for both, distinguished by
-- a new signal_type column. Default 'task' keeps existing rows correct.

ALTER TABLE benchmark_snapshots
  ADD COLUMN IF NOT EXISTS signal_type TEXT NOT NULL DEFAULT 'task';

ALTER TABLE benchmark_snapshots
  DROP CONSTRAINT IF EXISTS benchmark_snapshots_signal_type_check;
ALTER TABLE benchmark_snapshots
  ADD CONSTRAINT benchmark_snapshots_signal_type_check
  CHECK (signal_type IN ('task', 'speed', 'latency'));

-- Speed/latency rows are read by a different code path; index them separately.
CREATE INDEX IF NOT EXISTS idx_benchmark_snapshots_perf
  ON benchmark_snapshots(bearing_slug, signal_type)
  WHERE bearing_slug IS NOT NULL AND signal_type <> 'task';
