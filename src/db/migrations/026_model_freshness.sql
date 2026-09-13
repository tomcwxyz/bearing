ALTER TABLE models
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS verification_source TEXT,
  ADD COLUMN IF NOT EXISTS verification_note TEXT;

ALTER TABLE models
  DROP CONSTRAINT IF EXISTS models_verification_status_check;

ALTER TABLE models
  ADD CONSTRAINT models_verification_status_check
  CHECK (verification_status IN ('unknown', 'current', 'attention', 'unavailable'));

CREATE INDEX IF NOT EXISTS idx_models_verification_status
  ON models(verification_status)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_models_last_verified_at
  ON models(last_verified_at)
  WHERE active = true;

COMMENT ON COLUMN models.last_verified_at IS
  'Most recent time Bearing verified model availability/metadata against an external source.';
COMMENT ON COLUMN models.verification_status IS
  'Freshness/availability status: unknown, current, attention, unavailable.';
COMMENT ON COLUMN models.verification_source IS
  'Source used for the latest verification, e.g. provider:openai or openrouter.';
COMMENT ON COLUMN models.verification_note IS
  'Short human/audit note describing material drift or verification failure.';
