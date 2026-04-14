-- 007: Add local_info JSONB column for local inference metadata
-- Stores parameter count, MoE info, and quantization VRAM estimates.
-- NULL for closed-weight models.

ALTER TABLE models ADD COLUMN IF NOT EXISTS local_info JSONB DEFAULT NULL;
