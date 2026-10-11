-- 036: distinguish drafts from previously published, now retired models.
-- active remains the publication gate for all existing recommendation queries.
ALTER TABLE models
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retirement_reason TEXT,
  ADD COLUMN IF NOT EXISTS retired_by TEXT;

-- Best-effort classification of legacy inactive records: prior public use is
-- concrete evidence that an inactive record was once published. Unknown cases
-- remain drafts for manual review rather than being silently guessed at.
UPDATE models m
SET retired_at = COALESCE(m.updated_at, NOW()),
    retirement_reason = 'Legacy inactive model with historical recommendation or selection evidence',
    retired_by = 'migration:036'
WHERE m.active = false AND m.retired_at IS NULL
  AND (
    EXISTS (SELECT 1 FROM recommendations r WHERE r.model_slug = m.slug)
    OR EXISTS (SELECT 1 FROM selections s WHERE s.model_slug = m.slug)
    OR EXISTS (SELECT 1 FROM comparisons c WHERE c.model_a_slug = m.slug OR c.model_b_slug = m.slug)
  );

ALTER TABLE models DROP CONSTRAINT IF EXISTS models_retirement_consistency;
ALTER TABLE models ADD CONSTRAINT models_retirement_consistency
  CHECK (NOT (active AND retired_at IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_models_retired_at
  ON models(retired_at DESC) WHERE retired_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS model_lifecycle_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  model_slug TEXT NOT NULL REFERENCES models(slug),
  from_status TEXT NOT NULL CHECK (from_status IN ('draft', 'live', 'retired')),
  to_status TEXT NOT NULL CHECK (to_status IN ('draft', 'live', 'retired')),
  reason TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_lifecycle_events_model
  ON model_lifecycle_events(model_slug, changed_at DESC);

INSERT INTO model_lifecycle_events(model_slug, from_status, to_status, reason, changed_by, changed_at)
SELECT m.slug, 'live', 'retired', m.retirement_reason, 'migration:036', m.retired_at
FROM models m
WHERE m.retired_by = 'migration:036'
  AND NOT EXISTS (
    SELECT 1 FROM model_lifecycle_events e
    WHERE e.model_slug = m.slug AND e.changed_by = 'migration:036'
  );

COMMENT ON COLUMN models.retired_at IS
  'Non-null means a previously published model is retired, not an unpublished draft; active must be false.';
COMMENT ON COLUMN models.retirement_reason IS
  'Current retirement explanation; full transition history is retained in model_lifecycle_events.';
