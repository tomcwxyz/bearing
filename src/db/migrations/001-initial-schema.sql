CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  comparisons_today INT DEFAULT 0,
  last_comparison_date DATE
);

CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  description_hash TEXT,
  task_type       TEXT,
  task_subtype    TEXT,
  complexity      TEXT,
  input_length    TEXT,
  needs_vision    BOOLEAN DEFAULT false,
  needs_tools     BOOLEAN DEFAULT false,
  needs_code      BOOLEAN DEFAULT false,
  is_recurring    BOOLEAN DEFAULT false,
  mode            TEXT DEFAULT 'recommend',
  priority_order  JSONB,
  classification_confidence FLOAT
);

CREATE TABLE IF NOT EXISTS recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id),
  model_slug      TEXT NOT NULL,
  rank            INT NOT NULL,
  weighted_score  FLOAT NOT NULL,
  factor_scores   JSONB NOT NULL,
  reasoning       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS selections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id),
  model_slug      TEXT NOT NULL,
  recommended_rank INT,
  source          TEXT DEFAULT 'recommend',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id),
  selection_id    UUID REFERENCES selections(id),
  success         BOOLEAN,
  failure_reason  TEXT,
  feedback        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comparisons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id),
  user_id         UUID REFERENCES users(id),
  model_a_slug    TEXT NOT NULL,
  model_b_slug    TEXT NOT NULL,
  prompt_hash     TEXT,
  preferred       TEXT,
  preference_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_recommendations_task ON recommendations(task_id);
CREATE INDEX IF NOT EXISTS idx_selections_task ON selections(task_id);
