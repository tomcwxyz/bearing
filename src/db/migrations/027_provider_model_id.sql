ALTER TABLE models
  ADD COLUMN IF NOT EXISTS provider_model_id TEXT;

CREATE INDEX IF NOT EXISTS idx_models_provider_model_id
  ON models(provider, provider_model_id)
  WHERE active = true AND provider_model_id IS NOT NULL;

COMMENT ON COLUMN models.provider_model_id IS
  'Provider-native API model identifier used for provider-primary catalogue verification. Null means Bearing has no verified provider mapping.';
