CREATE TABLE IF NOT EXISTS rss_discovery_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  cursor_position INT NOT NULL DEFAULT 0 CHECK (cursor_position >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO rss_discovery_state (id, cursor_position)
VALUES (TRUE, 0)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at_on_rss_discovery_state ON rss_discovery_state;
CREATE TRIGGER set_updated_at_on_rss_discovery_state
  BEFORE UPDATE ON rss_discovery_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
