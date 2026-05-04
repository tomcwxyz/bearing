-- 009: External benchmark ingestion
--
-- benchmark_snapshots stores per-source per-category scores for each model,
-- with both the source's own model name (so we can ingest before mapping)
-- and a resolved bearing_slug (NULL until an alias matches).
--
-- benchmark_aliases is the manual map from "what the source calls this model"
-- to our registry slug. Kept separate from snapshots so re-mapping is cheap.

CREATE TABLE IF NOT EXISTS benchmark_snapshots (
  id                 BIGSERIAL PRIMARY KEY,
  source             TEXT NOT NULL,            -- 'lmarena' | 'livebench' | future sources
  source_category    TEXT NOT NULL,            -- e.g. 'text', 'webdev', 'vision' (lmarena) or 'coding' (livebench)
  source_model_name  TEXT NOT NULL,            -- name as reported by the source
  bearing_slug       TEXT,                     -- resolved at ingest via benchmark_aliases; NULL if no mapping yet
  raw_score          DOUBLE PRECISION NOT NULL,-- source's native scale (BT rating, 0-1, etc.)
  normalised_score   DOUBLE PRECISION NOT NULL,-- linearly normalised to 0..1 within the snapshot's cohort
  vote_count         INT,                      -- nullable: not all sources expose this
  snapshot_date      DATE NOT NULL,            -- the source's own publish date for this row
  captured_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_category, source_model_name, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_snapshots_slug
  ON benchmark_snapshots(bearing_slug)
  WHERE bearing_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_benchmark_snapshots_source_date
  ON benchmark_snapshots(source, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS benchmark_aliases (
  source            TEXT NOT NULL,
  source_model_name TEXT NOT NULL,
  bearing_slug      TEXT NOT NULL REFERENCES models(slug) ON UPDATE CASCADE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, source_model_name)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_aliases_slug ON benchmark_aliases(bearing_slug);
