-- 036: audit explicitly reviewed public model evidence.
CREATE TABLE IF NOT EXISTS model_evidence_reviews (
  proposal_id TEXT PRIMARY KEY,
  proposal_digest TEXT NOT NULL,
  model_slug TEXT NOT NULL,
  field TEXT NOT NULL,
  expected_value JSONB NOT NULL,
  proposed_value JSONB NOT NULL,
  evidence JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_model_evidence_reviews_slug_date
  ON model_evidence_reviews(model_slug, reviewed_at DESC);
