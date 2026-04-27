"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface UsageByModel {
  provider: string;
  model: string;
  estimatedCostUsd: number;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
}

interface UsageCall {
  id: string;
  createdAt: string;
  provider: string;
  callKind: string;
  route: string | null;
  workflowId: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  durationMs: number | null;
  success: boolean;
  status: string | null;
}

interface UsagePayload {
  period: { days: number; since: string | null };
  summary: {
    totalEstimatedCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
    byModel: UsageByModel[];
  };
  calls: UsageCall[];
}

const PERIOD_OPTIONS = [7, 30, 90, 365] as const;

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatLocalTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function CreatorUsageConsole() {
  const [days, setDays] = useState<number>(90);
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schemaNotice, setSchemaNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creator/usage?days=${days}`, { credentials: "include" });
      if (!res.ok) {
        setError(`Could not load usage (${res.status}).`);
        setPayload(null);
        return;
      }
      setSchemaNotice(
        res.headers.get("X-Gentle-Stream-Creator-Db") === "unavailable"
          ? "Creator Studio schema is not available to the API. Run the migrations (including `060_creator_studio_foundation.sql` for `llm_provider_calls.user_id`) in Supabase, then reload the schema cache. Until then, usage stays empty here."
          : null
      );
      setPayload((await res.json()) as UsagePayload);
    } catch {
      setError("Network error loading usage.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = payload?.summary;

  return (
    <main className="creator-studio">
      <div className="creator-studio__shell">
        <header className="creator-commandbar">
          <div className="creator-commandbar__copy">
            <p className="creator-eyebrow">Creator telemetry</p>
            <h1>Usage</h1>
            <p>Estimated costs and token use from logged Creator Studio LLM calls.</p>
          </div>
          <nav className="creator-commandbar__actions" aria-label="Creator usage navigation">
            <label className="creator-field">
              <span>Period</span>
              <select className="creator-input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {PERIOD_OPTIONS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
              </select>
            </label>
            <Link className="creator-action-link" href="/creator">Back to Writing</Link>
            <Link className="creator-action-link" href="/creator/settings">Creator settings</Link>
          </nav>
        </header>

        <div className="creator-usage-grid">
          {schemaNotice ? <section className="creator-note creator-note--warning" role="status">{schemaNotice}</section> : null}
          {error ? <p className="creator-note creator-note--danger" role="alert">{error}</p> : null}
          {loading ? <section className="creator-panel"><p className="creator-muted">Loading usage...</p></section> : null}

          {!loading && !error && !schemaNotice && payload && summary && summary.callCount === 0 ? (
            <section className="creator-panel">
              <div className="creator-panel__heading"><div><p className="creator-eyebrow">No rows</p><h2>No usage logged in this period</h2></div></div>
              <p className="creator-muted">Rows appear after the server records each LLM call in llm_provider_calls with your user id. Check migrations, saved provider keys, and whether calls completed successfully.</p>
            </section>
          ) : null}

          {summary && summary.callCount > 0 ? (
            <section className="creator-panel">
              <div className="creator-panel__heading"><div><p className="creator-eyebrow">Costs</p><h2>Summary</h2></div></div>
              {payload?.period.since != null ? <p className="creator-muted">From {formatLocalTime(payload.period.since)} to now (last {payload.period.days} days, capped at 500 calls).</p> : null}
              <div className="creator-metric-grid">
                <div className="creator-mini-card"><span>Total (est. USD)</span><strong>{formatUsd(summary.totalEstimatedCostUsd)}</strong></div>
                <div className="creator-mini-card"><span>Calls</span><strong>{summary.callCount}</strong></div>
                <div className="creator-mini-card"><span>Input tokens</span><strong>{summary.totalInputTokens.toLocaleString()}</strong></div>
                <div className="creator-mini-card"><span>Output tokens</span><strong>{summary.totalOutputTokens.toLocaleString()}</strong></div>
              </div>
              {summary.byModel.length > 0 ? (
                <div className="creator-table-wrap">
                  <table className="creator-table">
                    <thead><tr><th>Provider</th><th>Model</th><th>Est. cost</th><th>Calls</th><th>Tokens in</th><th>Tokens out</th></tr></thead>
                    <tbody>
                      {summary.byModel.map((row) => (
                        <tr key={row.provider + "-" + row.model}>
                          <td>{row.provider}</td>
                          <td>{row.model}</td>
                          <td>{formatUsd(row.estimatedCostUsd)}</td>
                          <td>{row.callCount}</td>
                          <td>{row.inputTokens.toLocaleString()}</td>
                          <td>{row.outputTokens.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}

          {summary && summary.callCount > 0 && payload ? (
            <section className="creator-panel">
              <div className="creator-panel__heading"><div><p className="creator-eyebrow">Newest first</p><h2>Recent calls</h2></div></div>
              <p className="creator-muted">Cost is a rough estimate at request time, not a billing invoice.</p>
              <div className="creator-table-wrap">
                <table className="creator-table">
                  <thead><tr><th>Time</th><th>Provider / model</th><th>Kind</th><th>Route</th><th>Est. $</th><th>In/Out</th><th>OK</th></tr></thead>
                  <tbody>
                    {payload.calls.map((c) => (
                      <tr key={c.id}>
                        <td>{formatLocalTime(c.createdAt)}</td>
                        <td><strong>{c.provider}</strong><br /><span>{c.model ?? "n/a"}</span></td>
                        <td>{c.callKind}</td>
                        <td>{c.route ?? "n/a"}</td>
                        <td>{formatUsd(c.estimatedCostUsd ?? 0)}</td>
                        <td>{c.inputTokens}/{c.outputTokens}</td>
                        <td>{c.success ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
