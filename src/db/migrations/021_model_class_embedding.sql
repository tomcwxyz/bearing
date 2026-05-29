-- v0.9.0 phase 1: introduce model_class + embedding-specific columns on models.
--
-- model_class splits the registry into 'chat' (the existing 31 generative
-- LLMs) and 'embedding' (the new embedding-model tier seeded in a later
-- phase). Defaulting to 'chat' preserves every existing row without
-- touching task_fitness — scoring will use model_class as a hard filter
-- (embedding tasks → embedding models only, chat tasks → chat models
-- only).
--
-- The embedding-only columns (embedding_dim, max_input_tokens,
-- supports_matryoshka) stay NULL on chat models. Carrying them on the
-- same table rather than a side table keeps the existing query surface
-- (`getAllModels`, `getAllModelsFromDb`) one-shot — and the 4 nulls per
-- chat row are cheaper than a join.
--
-- Wrapped in a DO block so the Neon serverless driver (single prepared
-- statement per call) applies the ALTERs + index together.
DO $$
BEGIN
  ALTER TABLE models
    ADD COLUMN IF NOT EXISTS model_class TEXT NOT NULL DEFAULT 'chat',
    ADD COLUMN IF NOT EXISTS embedding_dim INTEGER,
    ADD COLUMN IF NOT EXISTS max_input_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS supports_matryoshka BOOLEAN NOT NULL DEFAULT FALSE;

  CREATE INDEX IF NOT EXISTS models_class_active_idx
    ON models(model_class)
    WHERE active = true;
END $$;
