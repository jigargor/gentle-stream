-- Distributed rate limiting windows for API protection

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  policy_id TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (policy_id, bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_windows_updated_at
  ON rate_limit_windows (updated_at);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_policy_id TEXT,
  p_bucket_key TEXT,
  p_window_ms INTEGER,
  p_max INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  retry_after_sec INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  now_ts TIMESTAMPTZ := NOW();
  window_start_ts TIMESTAMPTZ;
  reset_ts TIMESTAMPTZ;
  next_count INTEGER;
BEGIN
  IF p_window_ms <= 0 OR p_max <= 0 THEN
    RAISE EXCEPTION 'Invalid rate limit params. window_ms and max must be > 0.';
  END IF;

  window_start_ts := TO_TIMESTAMP(
    FLOOR((EXTRACT(EPOCH FROM now_ts) * 1000) / p_window_ms) * p_window_ms / 1000
  );
  reset_ts := window_start_ts + ((p_window_ms || ' milliseconds')::INTERVAL);

  INSERT INTO rate_limit_windows (policy_id, bucket_key, window_start, request_count, updated_at)
  VALUES (p_policy_id, p_bucket_key, window_start_ts, 1, now_ts)
  ON CONFLICT (policy_id, bucket_key, window_start)
  DO UPDATE
    SET request_count = rate_limit_windows.request_count + 1,
        updated_at = now_ts
  RETURNING request_count INTO next_count;

  RETURN QUERY
  SELECT
    next_count <= p_max,
    GREATEST(0, p_max - next_count),
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reset_ts - now_ts)))::INTEGER),
    reset_ts;
END;
$$;
