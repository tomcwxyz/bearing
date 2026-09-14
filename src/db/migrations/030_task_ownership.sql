-- Optional task ownership for signed-in continuity.
-- Anonymous tasks remain valid: user_id is nullable by design.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_user_created
  ON tasks(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN tasks.user_id IS
  'Optional owner for signed-in continuity. Raw task descriptions remain unstored; ownership does not change anonymous use.';
