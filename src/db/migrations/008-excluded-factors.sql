-- 008: Add excluded_factors column for factor exclusion in scoring
-- Stores JSON array of factor names the user chose to exclude. NULL = all factors included.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS excluded_factors JSONB DEFAULT NULL;
