-- 032: Public data v2 — snapshot model-choice context and make room for
-- observed execution evidence without conflating recommendation fit with a run.
--
-- Privacy:
-- - choice_context stores only coarse device attributes explicitly present in
--   the browser-local hardware profile; never UA strings, IPs, raw GPU model
--   descriptions, prompts or task text.
-- - execution_observations is for actual execution evidence (runtime API,
--   user report, Bearing-hosted run), not predicted hardware fit.

ALTER TABLE selections
  ADD COLUMN IF NOT EXISTS model_metadata_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS choice_context JSONB;

-- Existing selections pre-date snapshotting. Backfill from the current
-- catalogue and mark the provenance honestly so downstream users do not
-- mistake this for selection-time state.
UPDATE selections s
SET model_metadata_snapshot = jsonb_build_object(
  'provider', m.provider,
  'model_class', COALESCE(m.model_class, 'chat'),
  'open_weights', COALESCE((m.transparency->>'open_weights')::numeric, 0),
  'licence_openness', COALESCE((m.transparency->>'licence_openness')::numeric, 0),
  'is_open_weight', COALESCE((m.transparency->>'open_weights')::numeric, 0) >= 0.8,
  'local_capable', m.local_info IS NOT NULL,
  'snapshot_source', 'backfill_current_catalogue'
)
FROM models m
WHERE s.model_slug = m.slug
  AND s.model_metadata_snapshot IS NULL;

CREATE TABLE IF NOT EXISTS execution_observations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id                 UUID NOT NULL REFERENCES tasks(id),
  selection_id            UUID REFERENCES selections(id),
  routed_run_id           UUID REFERENCES routed_runs(id),
  model_slug              TEXT NOT NULL,
  model_metadata_snapshot JSONB,
  execution_location      TEXT NOT NULL DEFAULT 'unknown',
  runtime                 TEXT,
  runtime_model_id        TEXT,
  quant                   TEXT,
  context_length          INT,
  hardware_profile        JSONB,
  measured_vram_gb        FLOAT,
  tokens_per_second       FLOAT,
  latency_ms              INT,
  evidence_source         TEXT NOT NULL DEFAULT 'user_report',
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_observations_task
  ON execution_observations(task_id);
CREATE INDEX IF NOT EXISTS idx_execution_observations_selection
  ON execution_observations(selection_id);
CREATE INDEX IF NOT EXISTS idx_execution_observations_model
  ON execution_observations(model_slug);
