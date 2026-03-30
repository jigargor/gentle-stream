-- Creator consent trail:
-- - explicit opt-in acknowledgement
-- - proof/reference of opt-in capture (URL, policy version, form id, etc.)
-- - timestamp of acknowledgement

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS consent_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS consent_proof TEXT;

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS consent_opt_in_at TIMESTAMPTZ;
