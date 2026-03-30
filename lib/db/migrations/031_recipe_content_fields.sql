-- Structured recipe content fields for creator-authored recipe submissions.

ALTER TABLE article_submissions
  ADD COLUMN IF NOT EXISTS recipe_servings INT,
  ADD COLUMN IF NOT EXISTS recipe_ingredients TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recipe_instructions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recipe_prep_time_minutes INT,
  ADD COLUMN IF NOT EXISTS recipe_cook_time_minutes INT,
  ADD COLUMN IF NOT EXISTS recipe_images TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS recipe_servings INT,
  ADD COLUMN IF NOT EXISTS recipe_ingredients TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recipe_instructions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recipe_prep_time_minutes INT,
  ADD COLUMN IF NOT EXISTS recipe_cook_time_minutes INT,
  ADD COLUMN IF NOT EXISTS recipe_images TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_articles_recipe_images_gin
  ON articles USING GIN (recipe_images);

CREATE INDEX IF NOT EXISTS idx_article_submissions_recipe_images_gin
  ON article_submissions USING GIN (recipe_images);
