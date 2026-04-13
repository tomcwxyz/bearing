CREATE TABLE IF NOT EXISTS models (
  slug              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  provider          TEXT NOT NULL,
  tier              TEXT NOT NULL,
  pricing           JSONB NOT NULL,
  context_window    INT NOT NULL,
  capabilities      TEXT[] NOT NULL DEFAULT '{}',
  strengths         TEXT[] NOT NULL DEFAULT '{}',
  weaknesses        TEXT[] NOT NULL DEFAULT '{}',
  task_fitness      JSONB NOT NULL DEFAULT '{}',
  speed_score       FLOAT NOT NULL DEFAULT 0.5,
  privacy_score     FLOAT NOT NULL DEFAULT 0.5,
  transparency      JSONB NOT NULL,
  sustainability    JSONB NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);
CREATE INDEX IF NOT EXISTS idx_models_tier ON models(tier);
CREATE INDEX IF NOT EXISTS idx_models_active ON models(active) WHERE active = true;

-- Document relationships to existing tables (not enforced as FK to avoid breaking historical data)
COMMENT ON COLUMN recommendations.model_slug IS 'References models.slug';
COMMENT ON COLUMN selections.model_slug IS 'References models.slug';
COMMENT ON COLUMN comparisons.model_a_slug IS 'References models.slug';
COMMENT ON COLUMN comparisons.model_b_slug IS 'References models.slug';
