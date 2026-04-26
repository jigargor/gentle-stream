-- AI code review audit trail (optional multi-reviewer / challenger validation; see `.codereview.yml`).

CREATE TABLE IF NOT EXISTS review_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('standard', 'challenger_validation')),
  prompt_template_id TEXT,
  context_package_hash TEXT,
  reviewer_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  adjudicator_model JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_usage_by_model JSONB NOT NULL DEFAULT '{}'::jsonb,
  latency_ms_by_model JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost_usd_by_model JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_runs_pr ON review_runs (repository, pr_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_runs_commit ON review_runs (commit_sha);

CREATE TABLE IF NOT EXISTS review_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_run_id UUID NOT NULL REFERENCES review_runs(id) ON DELETE CASCADE,
  finding_key TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_model JSONB NOT NULL DEFAULT '{}'::jsonb,
  title TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(review_run_id, finding_key)
);

CREATE INDEX IF NOT EXISTS idx_review_findings_run ON review_findings (review_run_id, severity);

CREATE TABLE IF NOT EXISTS review_finding_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_finding_id UUID NOT NULL REFERENCES review_findings(id) ON DELETE CASCADE,
  validity TEXT NOT NULL CHECK (validity IN ('unknown', 'confirmed', 'rejected')),
  significance TEXT NOT NULL CHECK (significance IN ('critical', 'high', 'medium', 'low')),
  lifecycle_stage TEXT NOT NULL CHECK (lifecycle_stage IN ('suggested', 'accepted', 'fixed', 'verified')),
  updated_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_finding_outcomes_finding
  ON review_finding_outcomes (review_finding_id, created_at DESC);

ALTER TABLE review_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_finding_outcomes ENABLE ROW LEVEL SECURITY;
