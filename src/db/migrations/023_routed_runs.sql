-- 023: Auto-routing & auto-comparison (Trio / Challenger)
--
-- The existing `comparisons` table is hardwired to exactly two models
-- (model_a_slug / model_b_slug, preferred) and stays as-is for the manual
-- /compare flow. Routed runs need 1..N models per run (single route, Trio of
-- three, Challenger pair) plus a machine judge verdict, so they get their own
-- generalised pair of tables.
--
-- Privacy parity with comparisons: we store hashes only, never raw prompt or
-- response text. A routed run logs the routing decision (which models, at what
-- rank/score), the judge's blind pick, and the human's preference — exactly the
-- dataset Bearing exists to publish.

CREATE TABLE IF NOT EXISTS routed_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID REFERENCES tasks(id),
  user_id           UUID REFERENCES users(id),
  mode              TEXT NOT NULL,          -- 'route' | 'trio' | 'challenger'
  prompt_hash       TEXT,                   -- sha256 of the prompt, never the prompt itself
  judged_winner     TEXT,                   -- model_slug chosen by the LLM judge (trio/challenger)
  judge_model       TEXT,                   -- which model produced the verdict
  human_preferred   TEXT,                   -- model_slug the user preferred (nullable)
  preference_reason TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routed_run_models (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routed_run_id     UUID REFERENCES routed_runs(id),
  model_slug        TEXT NOT NULL,
  route_rank        INT NOT NULL,           -- rank from scoreModels (1 = top)
  weighted_score    FLOAT,
  factor_scores     JSONB,
  role              TEXT NOT NULL,          -- 'primary' | 'candidate' | 'challenger'
  response_hash     TEXT,                   -- sha256 of the model's output
  est_cost          FLOAT,                  -- estimated $/task at route time
  est_co2_g         FLOAT,                  -- estimated gCO2eq per request (ecologits-grounded)
  latency_ms        INT,
  is_error          BOOLEAN DEFAULT false,
  error_reason      TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routed_runs_task ON routed_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_routed_runs_user_date ON routed_runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_routed_run_models_run ON routed_run_models(routed_run_id);
