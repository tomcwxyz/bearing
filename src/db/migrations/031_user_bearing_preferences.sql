CREATE TABLE IF NOT EXISTS user_bearing_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  learning_enabled BOOLEAN NOT NULL DEFAULT true,
  preferred_factors JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (preferred_factors IS NULL OR jsonb_typeof(preferred_factors) = 'array')
);

COMMENT ON TABLE user_bearing_preferences IS
  'Inspectable user defaults for automatic Bearing priorities. preferred_factors are explicit; learned tendencies are derived from structured selection evidence and are not stored as hidden rules.';

COMMENT ON COLUMN user_bearing_preferences.preferred_factors IS
  'Explicit factor defaults selected by the user. NULL means no explicit defaults; learned tendencies may still apply when learning_enabled=true.';
