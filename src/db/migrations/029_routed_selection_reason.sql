-- 029: Record why Bearing selected each routed candidate.
--
-- Information-seeking Trio/Challenger chooses models for useful contrast rather
-- than simply taking the next ranks. Keep that rationale alongside the route so
-- the learning dataset remains inspectable without storing raw prompts.

ALTER TABLE routed_run_models
  ADD COLUMN IF NOT EXISTS selection_reason TEXT;
