-- v0.8.1: persist the local-inference recommendation set per task.
--
-- Until now local model recommendations were computed on the fly from scored
-- models and returned to the UI but never stored. That means the public
-- dataset cannot answer "what local model would Bearing have suggested for
-- this task?" for any historical row. Going forward we write one row per
-- ranked local candidate at recommend time, alongside the cloud rankings in
-- `recommendations`.
--
-- One row per (task, candidate). Ranks are 1-based, contiguous within a
-- task, in the same order the UI shows them. A task with no viable local
-- candidates writes zero rows — absence in this table means "no local
-- recommendation produced", not "data missing".
--
-- Wrapped in a DO block so the Neon serverless driver (single prepared
-- statement per call) can apply table + index together.
DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS local_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    model_slug TEXT NOT NULL,
    rank INTEGER NOT NULL,
    effective_quality DOUBLE PRECISION NOT NULL,
    quant TEXT NOT NULL,
    vram_gb DOUBLE PRECISION NOT NULL,
    quality_penalty DOUBLE PRECISION NOT NULL,
    hardware_tier_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS local_recommendations_task_id_idx
    ON local_recommendations(task_id);
END $$;
