-- Persistent audit trail for provider calls (Anthropic now, extensible later).

CREATE TABLE IF NOT EXISTS llm_provider_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider TEXT NOT NULL,
  call_kind TEXT NOT NULL,
  route TEXT,
  agent TEXT,
  category TEXT,
  model TEXT,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  duration_ms INT,
  http_status INT,
  success BOOLEAN NOT NULL,
  error_code TEXT,
  error_message TEXT,
  correlation_id TEXT,
  ingest_run_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_llm_provider_calls_created_at
  ON llm_provider_calls (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_provider_calls_provider_kind_created
  ON llm_provider_calls (provider, call_kind, created_at DESC);
