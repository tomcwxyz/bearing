-- Public, plain-language intake. No direct mutation to canonical model records.
CREATE TABLE community_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('model_correction','recommendation','methodology','usability')),
  model_slug TEXT REFERENCES models(slug) ON DELETE SET NULL,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2500),
  evidence_url TEXT,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  source_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX community_feedback_review_idx ON community_feedback(status, created_at DESC);
CREATE INDEX community_feedback_rate_idx ON community_feedback(source_fingerprint, created_at DESC);
