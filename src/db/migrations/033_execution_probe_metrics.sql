-- 033: distinguish verification probes from real task executions and retain
-- runtime metrics that can validate Bearing's predicted local hardware fit.

ALTER TABLE execution_observations
  ADD COLUMN IF NOT EXISTS execution_purpose TEXT NOT NULL DEFAULT 'task_execution',
  ADD COLUMN IF NOT EXISTS runtime_version TEXT,
  ADD COLUMN IF NOT EXISTS prompt_tokens INT,
  ADD COLUMN IF NOT EXISTS output_tokens INT,
  ADD COLUMN IF NOT EXISTS total_duration_ms INT,
  ADD COLUMN IF NOT EXISTS load_duration_ms INT,
  ADD COLUMN IF NOT EXISTS prompt_eval_duration_ms INT;
