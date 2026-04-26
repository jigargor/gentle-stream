-- Creator Studio foundation: security/audit, BYOK, workflows, memory, and telemetry.

-- ─────────────────────────────────────────────────────────────────────────────
-- Article type support for creator submissions/published articles
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE article_submissions
  ADD COLUMN IF NOT EXISTS article_type TEXT,
  ADD COLUMN IF NOT EXISTS article_type_custom TEXT;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS article_type TEXT,
  ADD COLUMN IF NOT EXISTS article_type_custom TEXT;

CREATE INDEX IF NOT EXISTS idx_article_submissions_article_type
  ON article_submissions (article_type);

CREATE INDEX IF NOT EXISTS idx_articles_article_type
  ON articles (article_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- Creator settings and BYOK key metadata (ciphertext only, never plaintext)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_settings (
  user_id TEXT PRIMARY KEY REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  model_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (model_mode IN ('manual', 'auto', 'max')),
  default_provider TEXT,
  default_model TEXT,
  max_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  max_mode_budget_cents INT NOT NULL DEFAULT 0,
  autocomplete_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  autocomplete_prompt TEXT NOT NULL DEFAULT '',
  autocomplete_sensitive_drafts_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  memory_retention_days INT NOT NULL DEFAULT 90,
  monthly_budget_cents INT NOT NULL DEFAULT 0,
  daily_budget_cents INT NOT NULL DEFAULT 0,
  per_request_budget_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_provider_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  key_ciphertext TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_auth_tag TEXT NOT NULL,
  wrapped_dek TEXT NOT NULL,
  dek_wrap_iv TEXT NOT NULL,
  dek_wrap_auth_tag TEXT NOT NULL,
  key_last4 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'invalid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_creator_provider_keys_user_provider
  ON creator_provider_keys (user_id, provider);

-- ─────────────────────────────────────────────────────────────────────────────
-- Creator memory (raw sessions + compacted summaries)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_memory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  contains_pii BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creator_memory_sessions_user_created
  ON creator_memory_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_memory_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creator_memory_summaries_user_created
  ON creator_memory_summaries (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Creator audit events (security-critical actions)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  route TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_audit_events_user_created
  ON creator_audit_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_audit_events_type_created
  ON creator_audit_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_mfa_recovery_codes_user_created
  ON creator_mfa_recovery_codes (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend LLM telemetry for creator studio ops/cost controls
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE llm_provider_calls
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS workflow_id TEXT,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fallback_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_llm_provider_calls_user_created
  ON llm_provider_calls (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_provider_calls_workflow_created
  ON llm_provider_calls (workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_provider_calls_provider_model_created
  ON llm_provider_calls (provider, model, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger coverage for updated_at fields
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_updated_at_on_creator_settings ON creator_settings;
CREATE TRIGGER set_updated_at_on_creator_settings
  BEFORE UPDATE ON creator_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_on_creator_provider_keys ON creator_provider_keys;
CREATE TRIGGER set_updated_at_on_creator_provider_keys
  BEFORE UPDATE ON creator_provider_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: strict owner-only policies for creator studio tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE creator_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_provider_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_memory_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_memory_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_settings_own" ON creator_settings;
CREATE POLICY "creator_settings_own"
  ON creator_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "creator_provider_keys_own" ON creator_provider_keys;
CREATE POLICY "creator_provider_keys_own"
  ON creator_provider_keys FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "creator_memory_sessions_own" ON creator_memory_sessions;
CREATE POLICY "creator_memory_sessions_own"
  ON creator_memory_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "creator_memory_summaries_own" ON creator_memory_summaries;
CREATE POLICY "creator_memory_summaries_own"
  ON creator_memory_summaries FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "creator_audit_events_own" ON creator_audit_events;
CREATE POLICY "creator_audit_events_own"
  ON creator_audit_events FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "creator_mfa_recovery_codes_own" ON creator_mfa_recovery_codes;
CREATE POLICY "creator_mfa_recovery_codes_own"
  ON creator_mfa_recovery_codes FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);
