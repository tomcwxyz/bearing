-- Evidence history for conservative model retirement review.
CREATE TABLE IF NOT EXISTS model_availability_observations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  model_slug TEXT NOT NULL REFERENCES models(slug) ON DELETE CASCADE,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('current','attention','unavailable')),
  note TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_model_availability_observations_recent
  ON model_availability_observations(model_slug, source, observed_at DESC);
