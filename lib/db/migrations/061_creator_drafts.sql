-- Creator drafts + revision history foundation.

CREATE TABLE IF NOT EXISTS creator_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  content_kind TEXT NOT NULL DEFAULT 'user_article'
    CHECK (content_kind IN ('user_article', 'recipe')),
  article_type TEXT,
  article_type_custom TEXT,
  category TEXT NOT NULL DEFAULT 'Human Kindness',
  locale TEXT NOT NULL DEFAULT 'global',
  explicit_hashtags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  pull_quote TEXT NOT NULL DEFAULT '',
  private_notes_ciphertext TEXT,
  private_notes_iv TEXT,
  private_notes_auth_tag TEXT,
  never_send_to_ai BOOLEAN NOT NULL DEFAULT FALSE,
  content_hash TEXT NOT NULL DEFAULT '',
  word_count INT NOT NULL DEFAULT 0,
  revision BIGINT NOT NULL DEFAULT 1,
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id TEXT REFERENCES user_profiles (user_id) ON DELETE SET NULL,
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_draft_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES creator_drafts (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  revision BIGINT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  content_kind TEXT NOT NULL CHECK (content_kind IN ('user_article', 'recipe')),
  article_type TEXT,
  article_type_custom TEXT,
  category TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'global',
  explicit_hashtags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  pull_quote TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  word_count INT NOT NULL DEFAULT 0,
  version_reason TEXT NOT NULL
    CHECK (version_reason IN ('autosave', 'manual_checkpoint', 'restore', 'publish')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_drafts_user_deleted_updated
  ON creator_drafts (user_id, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_draft_versions_draft_created
  ON creator_draft_versions (draft_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_article_submissions_author_status_created
  ON article_submissions (author_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_article_submissions_author_created
  ON article_submissions (author_user_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_on_creator_drafts ON creator_drafts;
CREATE TRIGGER set_updated_at_on_creator_drafts
  BEFORE UPDATE ON creator_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE creator_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_draft_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_drafts_own" ON creator_drafts;
CREATE POLICY "creator_drafts_own"
  ON creator_drafts FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "creator_draft_versions_own" ON creator_draft_versions;
CREATE POLICY "creator_draft_versions_own"
  ON creator_draft_versions FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);
