CREATE TABLE IF NOT EXISTS catalogue_review_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_slug TEXT NOT NULL REFERENCES models(slug) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN (
    'input_price',
    'output_price',
    'context_window',
    'capabilities',
    'availability'
  )),
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'kept')),
  source TEXT NOT NULL,
  before_value JSONB NOT NULL,
  observed_value JSONB NOT NULL,
  reason TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogue_review_decisions_model_created
  ON catalogue_review_decisions(model_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_catalogue_review_decisions_latest_kept
  ON catalogue_review_decisions(model_slug, field, created_at DESC)
  WHERE decision = 'kept';

ALTER TABLE models
  DROP CONSTRAINT IF EXISTS models_verification_status_check;

ALTER TABLE models
  ADD CONSTRAINT models_verification_status_check
  CHECK (verification_status IN ('unknown', 'current', 'attention', 'unavailable', 'reviewed'));

COMMENT ON TABLE catalogue_review_decisions IS
  'Audit log of admin decisions about external catalogue drift. accepted means Bearing metadata changed; kept means Bearing deliberately retained its existing value.';

COMMENT ON COLUMN catalogue_review_decisions.before_value IS
  'Bearing value at review time, stored as JSON so scalar and array fields share one audit shape.';

COMMENT ON COLUMN catalogue_review_decisions.observed_value IS
  'External catalogue value at review time. A later different value should surface as new drift.';

COMMENT ON COLUMN models.verification_status IS
  'Freshness/availability status: unknown, current, attention, unavailable, reviewed. reviewed means current external disagreement was explicitly reviewed and Bearing retained its value.';
