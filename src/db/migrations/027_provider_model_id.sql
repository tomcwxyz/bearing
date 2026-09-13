ALTER TABLE models
  ADD COLUMN IF NOT EXISTS provider_model_id TEXT;

CREATE INDEX IF NOT EXISTS idx_models_provider_model_id
  ON models(provider, provider_model_id)
  WHERE active = true AND provider_model_id IS NOT NULL;

COMMENT ON COLUMN models.provider_model_id IS
  'Provider-native API model identifier used for provider-primary catalogue verification. Null means Bearing has no verified provider mapping.';

-- Seed only identifiers confirmed in current first-party provider docs.
-- Leave uncertain mappings null rather than deriving provider IDs from Bearing slugs.
UPDATE models SET provider_model_id = 'claude-fable-5'
WHERE slug = 'claude-fable-5' AND provider_model_id IS NULL;

UPDATE models SET provider_model_id = 'claude-sonnet-5'
WHERE slug = 'claude-sonnet-5' AND provider_model_id IS NULL;

UPDATE models SET provider_model_id = 'gpt-5.6-sol'
WHERE slug = 'gpt-5.6-sol' AND provider_model_id IS NULL;

UPDATE models SET provider_model_id = 'text-embedding-3-large'
WHERE slug = 'openai-embed-3-large' AND provider_model_id IS NULL;

UPDATE models SET provider_model_id = 'text-embedding-3-small'
WHERE slug = 'openai-embed-3-small' AND provider_model_id IS NULL;
