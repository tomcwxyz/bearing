-- v0.8.0: tag each task with the classification schema version it was
-- classified under, so public-dataset consumers can distinguish task_type
-- values produced under the old (v0.7) and new (v0.8) task-type enums.
--
-- Default 'v0.7' for existing rows is intentional — they really were
-- classified under the old enum. createTask() in src/lib/db.ts writes 'v0.8'
-- explicitly for new rows.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS classification_schema_version TEXT NOT NULL DEFAULT 'v0.7';
