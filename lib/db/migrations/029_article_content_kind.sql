-- Add a first-class content kind dimension:
-- - news (ingest pipeline)
-- - user_article (creator-written article)
-- - recipe (creator-written recipe with same moderation workflow)

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS content_kind TEXT NOT NULL DEFAULT 'news';

ALTER TABLE articles
  DROP CONSTRAINT IF EXISTS articles_content_kind_check;

ALTER TABLE articles
  ADD CONSTRAINT articles_content_kind_check
  CHECK (content_kind IN ('news', 'user_article', 'recipe'));

UPDATE articles
SET content_kind = CASE
  WHEN source = 'ingest' THEN 'news'
  WHEN source = 'creator' THEN 'user_article'
  ELSE 'news'
END
WHERE content_kind IS NULL
   OR content_kind NOT IN ('news', 'user_article', 'recipe');

ALTER TABLE article_submissions
  ADD COLUMN IF NOT EXISTS content_kind TEXT NOT NULL DEFAULT 'user_article';

ALTER TABLE article_submissions
  DROP CONSTRAINT IF EXISTS article_submissions_content_kind_check;

ALTER TABLE article_submissions
  ADD CONSTRAINT article_submissions_content_kind_check
  CHECK (content_kind IN ('user_article', 'recipe'));

UPDATE article_submissions
SET content_kind = 'user_article'
WHERE content_kind IS NULL
   OR content_kind NOT IN ('user_article', 'recipe');

CREATE INDEX IF NOT EXISTS idx_articles_content_kind_category_tagged
  ON articles (content_kind, category, tagged);

CREATE INDEX IF NOT EXISTS idx_article_submissions_content_kind_status_created
  ON article_submissions (content_kind, status, created_at DESC);
