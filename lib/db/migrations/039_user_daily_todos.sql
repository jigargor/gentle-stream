CREATE TABLE IF NOT EXISTS user_daily_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  local_day DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_daily_todos_user_day
  ON user_daily_todos (user_id, local_day, sort_order);

DROP TRIGGER IF EXISTS set_updated_at_on_user_daily_todos ON user_daily_todos;
CREATE TRIGGER set_updated_at_on_user_daily_todos
  BEFORE UPDATE ON user_daily_todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
