-- refresh_user_article_affinity joins `articles` while RLS is enabled on that table
-- with no permissive SELECT policies for API roles. SECURITY INVOKER then yields
-- zero joined rows → empty affinity snapshots with no error. Run as definer (owner)
-- so the rebuild sees article rows; restrict EXECUTE to service_role (server-only).

CREATE OR REPLACE FUNCTION refresh_user_article_affinity(p_user_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_article_affinity WHERE user_id = p_user_id;

  INSERT INTO user_article_affinity (
    user_id,
    category,
    locale,
    affinity_score,
    interactions,
    last_event_at,
    updated_at
  )
  SELECT
    e.user_id,
    a.category,
    COALESCE(NULLIF(a.locale, ''), 'global') AS locale,
    SUM(
      (
        CASE e.event_type
          WHEN 'impression' THEN
            0.12 * LEAST(1.0, GREATEST(0.0, COALESCE(e.event_value, 0.5)))
          WHEN 'open' THEN
            0.45
          WHEN 'click_through' THEN
            0.95 * LEAST(1.0, GREATEST(0.0, COALESCE(e.event_value, 1.0)))
          WHEN 'scroll_depth' THEN
            0.90 * LEAST(1.0, GREATEST(0.0, COALESCE(e.event_value, 0.0)))
          WHEN 'read_30s' THEN
            1.00 * LEAST(4.0, GREATEST(0.2, COALESCE(e.event_value, 30.0) / 30.0))
          WHEN 'read_75pct' THEN
            1.20 * LEAST(1.25, GREATEST(0.5, COALESCE(e.event_value, 0.75)))
          WHEN 'read_dwell' THEN
            0.35 * LN(1 + LEAST(900.0, GREATEST(0.0, COALESCE(e.event_value, 0.0))))
          WHEN 'like' THEN
            2.40
          WHEN 'save' THEN
            3.20
          WHEN 'share' THEN
            2.80
          ELSE
            0.0
        END
      )
      * EXP(-0.05 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - e.occurred_at)) / 86400.0))
    ) AS affinity_score,
    COUNT(*)::INT AS interactions,
    MAX(e.occurred_at) AS last_event_at,
    NOW() AS updated_at
  FROM article_engagement_events e
  JOIN articles a ON a.id = e.article_id
  WHERE e.user_id = p_user_id
    AND e.occurred_at >= NOW() - INTERVAL '30 days'
    AND a.deleted_at IS NULL
  GROUP BY e.user_id, a.category, COALESCE(NULLIF(a.locale, ''), 'global');
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_user_article_affinity(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_user_article_affinity(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_user_article_affinity(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_user_article_affinity(TEXT) TO service_role;
