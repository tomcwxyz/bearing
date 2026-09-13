CREATE TABLE IF NOT EXISTS model_routability (
  model_slug TEXT PRIMARY KEY REFERENCES models(slug) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('unknown', 'healthy', 'degraded', 'unavailable')),
  last_checked_at TIMESTAMPTZ,
  source TEXT,
  note TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS model_routability_status_checked_idx
  ON model_routability(status, last_checked_at DESC);

COMMENT ON TABLE model_routability IS
  'Runtime execution observations, kept separate from catalogue freshness. Only explicit model-unavailable responses should set unavailable; transient provider failures are degraded.';
