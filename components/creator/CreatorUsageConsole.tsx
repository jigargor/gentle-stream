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
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: "1rem" }}>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontFamily: "'Playfair Display', Georgia, serif" }}>Usage</h1>
          <p style={{ margin: "0.4rem 0 0", color: "#666", fontSize: "0.9rem" }}>
            Estimated costs and token use from your logged LLM calls (AI Assist, autocomplete, and other creator routes
            that use your keys). Totals and the table use the same time range (up to 500 most recent calls in the
            window).
          </p>
          <div style={{ marginTop: "0.65rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <label style={{ fontSize: "0.88rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              Period
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                style={{ padding: "0.25rem 0.4rem" }}
              >
                {PERIOD_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    Last {d} days
                  </option>
                ))}
              </select>
            </label>
            <Link
              href="/creator"
              style={{
                display: "inline-flex",
                padding: "0.35rem 0.65rem",
                border: "1px solid #1a472a",
                color: "#1a472a",
                textDecoration: "none",
                fontSize: "0.82rem",
                fontFamily: "'IM Fell English', Georgia, serif",
              }}
            >
              Back to Writing
            </Link>
            <Link
              href="/creator/settings"
              style={{
                display: "inline-flex",
                padding: "0.35rem 0.65rem",
                border: "1px solid #1a472a",
                color: "#1a472a",
                textDecoration: "none",
                fontSize: "0.82rem",
                fontFamily: "'IM Fell English', Georgia, serif",
              }}
            >
              Creator settings
            </Link>
          </div>
        </section>

        {schemaNotice ? (
          <section
            role="status"
            style={{
              background: "#fff8e6",
              border: "1px solid #c9a227",
              padding: "0.85rem 1rem",
              color: "#3d3200",
              fontSize: "0.9rem",
              lineHeight: 1.45,
            }}
          >
            {schemaNotice}
          </section>
        ) : null}

        {error ? (
          <p style={{ color: "#8b4513" }} role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p style={{ color: "#666" }}>Loading usage…</p>
        ) : !loading && !error && !schemaNotice && payload && summary && summary.callCount === 0 ? (
          <section
            style={{
              background: "#faf8f3",
              border: "1px solid #d8d2c7",
              padding: "1rem",
              fontSize: "0.9rem",
              lineHeight: 1.5,
              color: "#444",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>No usage logged in this period</p>
            <p style={{ margin: "0.5rem 0 0" }}>
              Rows appear after the server records each LLM call in <code>llm_provider_calls</code> with your user id.
              If you have used AI Assist but still see nothing, check: (1) migration{" "}
              <code>060_creator_studio_foundation.sql</code> applied (adds <code>user_id</code> and{" "}
              <code>estimated_cost_usd</code>), (2) provider API keys saved in Creator settings, (3) calls completed
              successfully (failed calls may log with zero or null cost), (4) you are on the same account as the one
              that invoked assist.
            </p>
          </section>
        ) : null}

        {summary && summary.callCount > 0 ? (
          <section
            style={{
              background: "#faf8f3",
              border: "1px solid #d8d2c7",
              padding: "1rem",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Summary</h2>
            {payload?.period.since != null ? (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#666" }}>
                From {formatLocalTime(payload.period.since)} to now (last {payload.period.days} days, capped at 500 calls).
              </p>
            ) : null}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "0.5rem",
              }}
            >
              <div style={{ border: "1px solid #d8d2c7", background: "#fff", padding: "0.5rem" }}>
                <div style={{ fontSize: "0.72rem", color: "#666" }}>Total (est. USD)</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{formatUsd(summary.totalEstimatedCostUsd)}</div>
              </div>
              <div style={{ border: "1px solid #d8d2c7", background: "#fff", padding: "0.5rem" }}>
                <div style={{ fontSize: "0.72rem", color: "#666" }}>Calls</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{summary.callCount}</div>
              </div>
              <div style={{ border: "1px solid #d8d2c7", background: "#fff", padding: "0.5rem" }}>
                <div style={{ fontSize: "0.72rem", color: "#666" }}>Input tokens</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{summary.totalInputTokens.toLocaleString()}</div>
              </div>
              <div style={{ border: "1px solid #d8d2c7", background: "#fff", padding: "0.5rem" }}>
                <div style={{ fontSize: "0.72rem", color: "#666" }}>Output tokens</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{summary.totalOutputTokens.toLocaleString()}</div>
              </div>
            </div>

            {summary.byModel.length > 0 ? (
              <div>
                <h3 style={{ margin: "0.25rem 0 0.4rem", fontSize: "0.95rem" }}>By model</h3>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.82rem",
                      background: "#fff",
                      border: "1px solid #d8d2c7",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f0ebe0" }}>
                        <th style={{ textAlign: "left", padding: "0.4rem" }}>Provider</th>
                        <th style={{ textAlign: "left", padding: "0.4rem" }}>Model</th>
                        <th style={{ textAlign: "right", padding: "0.4rem" }}>Est. cost</th>
                        <th style={{ textAlign: "right", padding: "0.4rem" }}>Calls</th>
                        <th style={{ textAlign: "right", padding: "0.4rem" }}>Tokens in</th>
                        <th style={{ textAlign: "right", padding: "0.4rem" }}>Tokens out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.byModel.map((row) => (
                        <tr key={`${row.provider}-${row.model}`}>
                          <td style={{ padding: "0.35rem 0.4rem" }}>{row.provider}</td>
                          <td style={{ padding: "0.35rem 0.4rem", fontFamily: "ui-monospace, monospace" }}>{row.model}</td>
                          <td style={{ padding: "0.35rem 0.4rem", textAlign: "right" }}>{formatUsd(row.estimatedCostUsd)}</td>
                          <td style={{ padding: "0.35rem 0.4rem", textAlign: "right" }}>{row.callCount}</td>
                          <td style={{ padding: "0.35rem 0.4rem", textAlign: "right" }}>{row.inputTokens.toLocaleString()}</td>
                          <td style={{ padding: "0.35rem 0.4rem", textAlign: "right" }}>{row.outputTokens.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {summary && summary.callCount > 0 && payload && (
          <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Recent calls</h2>
            <p style={{ margin: "0.35rem 0 0.75rem", fontSize: "0.8rem", color: "#666" }}>
              Newest first. Cost is a rough estimate at request time, not a billing invoice.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.78rem",
                  background: "#fff",
                  border: "1px solid #d8d2c7",
                }}
              >
                <thead>
                  <tr style={{ background: "#f0ebe0" }}>
                    <th style={{ textAlign: "left", padding: "0.35rem" }}>Time</th>
                    <th style={{ textAlign: "left", padding: "0.35rem" }}>Provider / model</th>
                    <th style={{ textAlign: "left", padding: "0.35rem" }}>Kind</th>
                    <th style={{ textAlign: "left", padding: "0.35rem" }}>Route</th>
                    <th style={{ textAlign: "right", padding: "0.35rem" }}>Est. $</th>
                    <th style={{ textAlign: "right", padding: "0.35rem" }}>In/Out</th>
                    <th style={{ textAlign: "center", padding: "0.35rem" }}>OK</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.calls.map((c) => (
                    <tr key={c.id}>
                      <td style={{ padding: "0.3rem 0.35rem", whiteSpace: "nowrap" }}>{formatLocalTime(c.createdAt)}</td>
                      <td style={{ padding: "0.3rem 0.35rem" }}>
                        <span style={{ color: "#333" }}>{c.provider}</span>
                        <br />
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.76rem" }}>{c.model ?? "—"}</span>
                      </td>
                      <td style={{ padding: "0.3rem 0.35rem", fontFamily: "ui-monospace, monospace" }}>{c.callKind}</td>
                      <td style={{ padding: "0.3rem 0.35rem", maxWidth: 200, wordBreak: "break-word" }}>{c.route ?? "—"}</td>
                      <td style={{ padding: "0.3rem 0.35rem", textAlign: "right" }}>{formatUsd(c.estimatedCostUsd ?? 0)}</td>
                      <td style={{ padding: "0.3rem 0.35rem", textAlign: "right", whiteSpace: "nowrap" }}>
                        {c.inputTokens}/{c.outputTokens}
                      </td>
                      <td style={{ padding: "0.3rem 0.35rem", textAlign: "center" }}>{c.success ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
