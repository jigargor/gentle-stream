-- Enforce MFA (opt-in) at the database layer for sensitive user tables.
-- If a user has at least one verified MFA factor, only aal2 JWTs are accepted.
-- If a user has no verified factor, aal1 and aal2 are both accepted.

CREATE OR REPLACE FUNCTION public.auth_mfa_opt_in_allows()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM auth.mfa_factors f
      WHERE f.user_id = auth.uid()
        AND f.status = 'verified'
    )
      THEN COALESCE((SELECT auth.jwt()->>'aal'), 'aal1') = 'aal2'
    ELSE true
  END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_mfa_opt_in_allows() TO authenticated;

DROP POLICY IF EXISTS "mfa_opt_in_user_profiles" ON user_profiles;
CREATE POLICY "mfa_opt_in_user_profiles"
  ON user_profiles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.auth_mfa_opt_in_allows())
  WITH CHECK (public.auth_mfa_opt_in_allows());

DROP POLICY IF EXISTS "mfa_opt_in_game_completions" ON game_completions;
CREATE POLICY "mfa_opt_in_game_completions"
  ON game_completions
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.auth_mfa_opt_in_allows())
  WITH CHECK (public.auth_mfa_opt_in_allows());

DROP POLICY IF EXISTS "mfa_opt_in_game_saves" ON game_saves;
CREATE POLICY "mfa_opt_in_game_saves"
  ON game_saves
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.auth_mfa_opt_in_allows())
  WITH CHECK (public.auth_mfa_opt_in_allows());

DROP POLICY IF EXISTS "mfa_opt_in_article_likes" ON article_likes;
CREATE POLICY "mfa_opt_in_article_likes"
  ON article_likes
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.auth_mfa_opt_in_allows())
  WITH CHECK (public.auth_mfa_opt_in_allows());

DROP POLICY IF EXISTS "mfa_opt_in_article_saves" ON article_saves;
CREATE POLICY "mfa_opt_in_article_saves"
  ON article_saves
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.auth_mfa_opt_in_allows())
  WITH CHECK (public.auth_mfa_opt_in_allows());

