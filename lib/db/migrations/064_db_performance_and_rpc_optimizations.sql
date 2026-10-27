-- Migration 064: Aggregate RPCs only (fast / safe for Supabase SQL Editor).
-- Heavy index + FTS DDL is split into 065 and 066 to avoid connection timeouts
-- when Disk IO is already constrained.
--
-- Run this file first. Expected runtime: a few seconds.

-- ─── Aggregate RPCs (replace unbounded client-side scans) ─────────────────────

CREATE OR REPLACE FUNCTION public.get_article_stock_snapshot_by_category(
  p_include_user_submitted BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  category TEXT,
  available_count BIGINT,
  newest_fetched_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.category,
    COUNT(*)::BIGINT AS available_count,
    MAX(a.fetched_at) AS newest_fetched_at
  FROM articles a
  WHERE a.tagged = TRUE
    AND a.deleted_at IS NULL
    AND a.moderation_status = 'approved'
    AND (
      p_include_user_submitted
      OR COALESCE(a.content_kind, 'news') <> 'user_article'
    )
  GROUP BY a.category;
$$;

REVOKE ALL ON FUNCTION public.get_article_stock_snapshot_by_category(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_article_stock_snapshot_by_category(BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION public.get_engagement_health_article_metrics()
RETURNS TABLE (
  unique_categories BIGINT,
  total_articles BIGINT,
  total_used_count BIGINT,
  newest_fetched_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(DISTINCT a.category)::BIGINT AS unique_categories,
    COUNT(*)::BIGINT AS total_articles,
    COALESCE(SUM(a.used_count), 0)::BIGINT AS total_used_count,
    MAX(a.fetched_at) AS newest_fetched_at
  FROM articles a
  WHERE a.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_engagement_health_article_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_engagement_health_article_metrics() TO service_role;

CREATE OR REPLACE FUNCTION public.get_preferred_locale_demand(p_limit INT DEFAULT 8)
RETURNS TABLE (
  locale TEXT,
  weight NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH expanded AS (
    SELECT
      NULLIF(TRIM(loc), '') AS locale,
      (1.0 / GREATEST(cardinality(up.preferred_locales), 1))::NUMERIC AS per_locale_weight
    FROM user_profiles up
    CROSS JOIN LATERAL unnest(COALESCE(up.preferred_locales, ARRAY[]::TEXT[])) AS loc
  ),
  scored AS (
    SELECT
      e.locale,
      ROUND(SUM(e.per_locale_weight)::NUMERIC, 4) AS weight
    FROM expanded e
    WHERE e.locale IS NOT NULL
    GROUP BY e.locale
  )
  SELECT s.locale, s.weight
  FROM scored s
  ORDER BY s.weight DESC, s.locale ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 48));
$$;

REVOKE ALL ON FUNCTION public.get_preferred_locale_demand(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_preferred_locale_demand(INT) TO service_role;

CREATE OR REPLACE FUNCTION public.increment_used_count_game(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE games
  SET used_count = COALESCE(used_count, 0) + 1
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_used_count_game(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_used_count_game(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_operational_tables()
RETURNS TABLE (
  rate_limit_windows_deleted BIGINT,
  soft_seen_deleted BIGINT,
  llm_provider_calls_deleted BIGINT,
  cron_ingest_runs_deleted BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate BIGINT := 0;
  v_soft BIGINT := 0;
  v_llm BIGINT := 0;
  v_cron BIGINT := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM rate_limit_windows
    WHERE updated_at < NOW() - INTERVAL '2 hours'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_rate FROM deleted;

  WITH deleted AS (
    DELETE FROM user_seen_articles
    WHERE source = 'ranker_soft'
      AND seen_at < NOW() - INTERVAL '7 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_soft FROM deleted;

  WITH deleted AS (
    DELETE FROM llm_provider_calls
    WHERE created_at < NOW() - INTERVAL '30 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_llm FROM deleted;

  WITH deleted AS (
    DELETE FROM cron_ingest_runs
    WHERE started_at < NOW() - INTERVAL '30 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_cron FROM deleted;

  rate_limit_windows_deleted := v_rate;
  soft_seen_deleted := v_soft;
  llm_provider_calls_deleted := v_llm;
  cron_ingest_runs_deleted := v_cron;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_operational_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_operational_tables() TO service_role;
