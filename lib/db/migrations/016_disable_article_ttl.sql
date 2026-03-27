-- Disable TTL expiry for all article rows.
-- Keep the expires_at column for backward compatibility with existing code/indexes.

ALTER TABLE articles
  ALTER COLUMN expires_at SET DEFAULT '2100-01-01T00:00:00.000Z'::timestamptz;

UPDATE articles
SET expires_at = '2100-01-01T00:00:00.000Z'::timestamptz
WHERE expires_at < '2100-01-01T00:00:00.000Z'::timestamptz;
