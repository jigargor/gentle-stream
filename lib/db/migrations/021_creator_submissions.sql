-- Creator onboarding + moderation queue + publish metadata.

-- ─── Articles: creator publish metadata ──────────────────────────────────────
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ingest';

ALTER TABLE articles
  DROP CONSTRAINT IF EXISTS articles_source_check;

ALTER TABLE articles
  ADD CONSTRAINT articles_source_check
  CHECK (source IN ('ingest', 'creator'));

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS author_user_id TEXT;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS submission_id UUID;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS creator_explicit_tags TEXT[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_submission_unique
  ON articles (submission_id)
  WHERE submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_articles_source_tagged
  ON articles (source, tagged);

-- ─── Creator profile extensions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_profiles (
  user_id                    TEXT PRIMARY KEY REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  pen_name                   TEXT NOT NULL,
  bio                        TEXT NOT NULL DEFAULT '',
  interest_categories        TEXT[] NOT NULL DEFAULT '{}',
  website_url                TEXT,
  locale                     TEXT,
  timezone                   TEXT,
  guidelines_acknowledged_at TIMESTAMPTZ,
  onboarding_completed_at    TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id      TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
  headline            TEXT NOT NULL,
  subheadline         TEXT NOT NULL DEFAULT '',
  body                TEXT NOT NULL,
  pull_quote          TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL,
  locale              TEXT NOT NULL DEFAULT 'global',
  explicit_hashtags   TEXT[] NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'pending',
  admin_note          TEXT,
  rejection_reason    TEXT,
  reviewed_by_user_id TEXT,
  reviewed_at         TIMESTAMPTZ,
  published_article_id UUID REFERENCES articles (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE article_submissions
  DROP CONSTRAINT IF EXISTS article_submissions_status_check;

ALTER TABLE article_submissions
  ADD CONSTRAINT article_submissions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn'));

CREATE INDEX IF NOT EXISTS idx_article_submissions_status_created_at
  ON article_submissions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_article_submissions_author_created_at
  ON article_submissions (author_user_id, created_at DESC);

-- Ensure one article submission can publish at most one article.
CREATE UNIQUE INDEX IF NOT EXISTS idx_article_submissions_published_article_unique
  ON article_submissions (published_article_id)
  WHERE published_article_id IS NOT NULL;

ALTER TABLE articles
  DROP CONSTRAINT IF EXISTS articles_submission_id_fkey;

ALTER TABLE articles
  ADD CONSTRAINT articles_submission_id_fkey
  FOREIGN KEY (submission_id) REFERENCES article_submissions (id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS set_updated_at_on_creator_profiles ON creator_profiles;
CREATE TRIGGER set_updated_at_on_creator_profiles
  BEFORE UPDATE ON creator_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_on_article_submissions ON article_submissions;
CREATE TRIGGER set_updated_at_on_article_submissions
  BEFORE UPDATE ON article_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
