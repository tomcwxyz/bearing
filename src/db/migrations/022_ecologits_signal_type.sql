-- Add 'sustainability' to the benchmark_snapshots.signal_type check constraint.
-- Required for EcoLogits inference_efficiency rows, which are tagged
-- signal_type='sustainability' to distinguish them from task-quality ('task'),
-- speed ('speed'), and latency ('latency') signals.

DO $$
BEGIN
  -- Drop the existing check constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'benchmark_snapshots_signal_type_check'
  ) THEN
    ALTER TABLE benchmark_snapshots
      DROP CONSTRAINT benchmark_snapshots_signal_type_check;
  END IF;

  -- Re-add with 'sustainability' included
  ALTER TABLE benchmark_snapshots
    ADD CONSTRAINT benchmark_snapshots_signal_type_check
    CHECK (signal_type IN ('task', 'speed', 'latency', 'sustainability'));
END $$;
