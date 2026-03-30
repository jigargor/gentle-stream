-- Per-user ratings for recipe articles (0..5 stars).

CREATE TABLE IF NOT EXISTS recipe_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  article_id UUID NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 0 AND rating <= 5),
  rated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_ratings_user
  ON recipe_ratings (user_id, rated_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipe_ratings_article
  ON recipe_ratings (article_id, rated_at DESC);

ALTER TABLE recipe_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipe_ratings_own" ON recipe_ratings;
CREATE POLICY "recipe_ratings_own"
  ON recipe_ratings FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Respect MFA opt-in enforcement for sensitive per-user writes.
DROP POLICY IF EXISTS "mfa_opt_in_recipe_ratings" ON recipe_ratings;
DO $$
BEGIN
  -- Current helper signature used by this repo's MFA migration.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'auth_mfa_opt_in_allows'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "mfa_opt_in_recipe_ratings"
        ON recipe_ratings
        AS RESTRICTIVE
        FOR ALL
        TO authenticated
        USING (public.auth_mfa_opt_in_allows())
        WITH CHECK (public.auth_mfa_opt_in_allows())
    $policy$;
  -- Backward-compat fallback in case an older helper with text arg exists.
  ELSIF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'auth_mfa_opt_in_allows'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "mfa_opt_in_recipe_ratings"
        ON recipe_ratings
        AS RESTRICTIVE
        FOR ALL
        TO authenticated
        USING (public.auth_mfa_opt_in_allows(auth.uid()::text))
        WITH CHECK (public.auth_mfa_opt_in_allows(auth.uid()::text))
    $policy$;
  END IF;
END
$$;
