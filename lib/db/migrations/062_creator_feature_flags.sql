CREATE TABLE IF NOT EXISTS creator_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'cohort', 'user')),
  scope_value TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flag_key, scope_type, scope_value)
);

CREATE INDEX IF NOT EXISTS idx_creator_feature_flags_scope
  ON creator_feature_flags (scope_type, scope_value, flag_key);

DROP TRIGGER IF EXISTS set_updated_at_on_creator_feature_flags ON creator_feature_flags;
CREATE TRIGGER set_updated_at_on_creator_feature_flags
  BEFORE UPDATE ON creator_feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE creator_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_feature_flags_read" ON creator_feature_flags;
CREATE POLICY "creator_feature_flags_read"
  ON creator_feature_flags FOR SELECT TO authenticated
  USING (
    scope_type = 'global'
    OR (scope_type = 'user' AND scope_value = auth.uid()::text)
  );
