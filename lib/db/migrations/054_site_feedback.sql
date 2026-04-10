-- Site feedback from the in-app widget (stored for admin review via service role).

CREATE TABLE IF NOT EXISTS site_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message TEXT NOT NULL CHECK (char_length(message) >= 1 AND char_length(message) <= 8000),
  page_url TEXT,
  contact_email TEXT,
  user_agent TEXT,
  user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_site_feedback_created_at ON site_feedback (created_at DESC);

COMMENT ON TABLE site_feedback IS 'User feedback; inserts via API (service role); admin reads in-app or SQL.';
