-- Recipes use a single storage bucket instead of editorial news categories.
UPDATE articles
SET category = 'recipe'
WHERE content_kind = 'recipe';

UPDATE article_submissions
SET category = 'recipe'
WHERE content_kind = 'recipe';
