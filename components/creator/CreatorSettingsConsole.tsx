"use client";

import { useEffect, useState } from "react";

interface CreatorSettingsResponse {
  /** Present after GET from API; never sent on PATCH (schema is `.strict()`). */
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  modelMode: "manual" | "auto" | "max";
  defaultProvider: "anthropic" | "openai" | "gemini" | null;
  defaultModel: string | null;
  maxModeEnabled: boolean;
  maxModeBudgetCents: number;
  autocompleteEnabled: boolean;
  autocompletePrompt: string;
  autocompleteSensitiveDraftsBlocked: boolean;
  memoryEnabled: boolean;
  memoryRetentionDays: number;
  monthlyBudgetCents: number;
  dailyBudgetCents: number;
  perRequestBudgetCents: number;
}

function buildSettingsPatchBody(state: CreatorSettingsResponse): Record<string, unknown> {
  return {
    modelMode: state.modelMode,
    defaultProvider: state.defaultProvider,
    defaultModel: state.defaultModel === "" ? null : state.defaultModel,
    maxModeEnabled: state.maxModeEnabled,
    maxModeBudgetCents: state.maxModeBudgetCents,
    autocompleteEnabled: state.autocompleteEnabled,
    autocompletePrompt: state.autocompletePrompt,
    autocompleteSensitiveDraftsBlocked: state.autocompleteSensitiveDraftsBlocked,
    memoryEnabled: state.memoryEnabled,
    memoryRetentionDays: state.memoryRetentionDays,
    monthlyBudgetCents: state.monthlyBudgetCents,
    dailyBudgetCents: state.dailyBudgetCents,
    perRequestBudgetCents: state.perRequestBudgetCents,
  };
}

interface ProviderKeyMeta {
  id: string;
  provider: "anthropic" | "openai" | "gemini";
  last4: string;
  status: "active" | "revoked" | "invalid";
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

const PROVIDERS: Array<ProviderKeyMeta["provider"]> = ["anthropic", "openai", "gemini"];

const DEFAULT_SETTINGS: CreatorSettingsResponse = {
  modelMode: "manual",
  defaultProvider: null,
  defaultModel: "",
  maxModeEnabled: false,
  maxModeBudgetCents: 0,
  autocompleteEnabled: false,
  autocompletePrompt: "",
  autocompleteSensitiveDraftsBlocked: false,
  memoryEnabled: true,
  memoryRetentionDays: 90,
  monthlyBudgetCents: 0,
  dailyBudgetCents: 0,
  perRequestBudgetCents: 0,
};

export function CreatorSettingsConsole() {
  const [settings, setSettings] = useState<CreatorSettingsResponse>(DEFAULT_SETTINGS);
  const [keys, setKeys] = useState<ProviderKeyMeta[]>([]);
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [schemaNotice, setSchemaNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadState() {
    const [settingsRes, keysRes] = await Promise.all([
      fetch("/api/creator/settings"),
      fetch("/api/creator/settings/provider-keys"),
    ]);
    const dbUnavailable =
      settingsRes.headers.get("X-Gentle-Stream-Creator-Db") === "unavailable" ||
      keysRes.headers.get("X-Gentle-Stream-Creator-Db") === "unavailable";
    if (settingsRes.ok) {
      setSettings((await settingsRes.json()) as CreatorSettingsResponse);
    }
    if (keysRes.ok) {
      const payload = (await keysRes.json()) as { keys?: ProviderKeyMeta[] };
      setKeys(payload.keys ?? []);
    }
    setSchemaNotice(
      dbUnavailable
        ? "Creator Studio tables are not visible to the API yet. Run lib/db/migrations/060_creator_studio_foundation.sql in the Supabase SQL editor, then reload the schema cache under Project Settings → API. The form shows defaults; saves and keys will not persist until then."
        : null
    );
  }

  useEffect(() => {
    void loadState();
  }, []);

  async function saveSettings() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/creator/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSettingsPatchBody(settings)),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage(body?.error ?? "Could not save settings.");
        return;
      }
      setMessage("Settings saved.");
      await loadState();
    } finally {
      setBusy(false);
    }
  }

  async function upsertKey(provider: ProviderKeyMeta["provider"]) {
    const apiKey = (draftKeys[provider] ?? "").trim();
    if (!apiKey) {
      setMessage(`Enter a ${provider} key first.`);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/creator/settings/provider-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action: "upsert", apiKey }),
      });
      if (!res.ok) {
        setMessage(`Could not save ${provider} key.`);
        return;
      }
      setDraftKeys((prev) => ({ ...prev, [provider]: "" }));
      setMessage(`${provider} key saved.`);
      await loadState();
    } finally {
      setBusy(false);
    }
  }

  async function keyAction(provider: ProviderKeyMeta["provider"], action: "revoke" | "delete") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/creator/settings/provider-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action }),
      });
      if (!res.ok) {
        setMessage(`Could not ${action} ${provider} key.`);
        return;
      }
      setMessage(`${provider} key ${action}d.`);
      await loadState();
    } finally {
      setBusy(false);
    }
  }

  async function testKey(provider: ProviderKeyMeta["provider"]) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/creator/settings/provider-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        setMessage(`${provider} test failed.`);
        return;
      }
      setMessage(`${provider} key is healthy.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: "1rem" }}>
        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Creator Settings</h1>
          <p style={{ margin: "0.4rem 0 0", color: "#666" }}>
            Bring-your-own-key model controls, budgets, autocomplete, and memory policy.
          </p>
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

        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem", display: "grid", gap: "0.6rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Model Router</h2>
          <label>
            Mode
            <select
              value={settings.modelMode}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, modelMode: event.target.value as CreatorSettingsResponse["modelMode"] }))
              }
            >
              <option value="manual">Manual</option>
              <option value="auto">Auto</option>
              <option value="max">Max</option>
            </select>
          </label>
          <label>
            Default provider
            <select
              value={settings.defaultProvider ?? ""}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  defaultProvider: (event.target.value || null) as CreatorSettingsResponse["defaultProvider"],
                }))
              }
            >
              <option value="">None</option>
              {PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
          <label>
            Default model
            <input
              value={settings.defaultModel ?? ""}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, defaultModel: event.target.value }))
              }
              placeholder="e.g. claude-sonnet-4-20250514"
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.maxModeEnabled}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, maxModeEnabled: event.target.checked }))
              }
            />
            Enable max mode (requires MFA step-up)
          </label>
          <label>
            Max mode budget (cents)
            <input
              type="number"
              value={settings.maxModeBudgetCents}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, maxModeBudgetCents: Number(event.target.value || 0) }))
              }
            />
          </label>
          <div style={{ display: "grid", gap: "0.35rem", gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            <label>
              Per request budget (cents)
              <input
                type="number"
                value={settings.perRequestBudgetCents}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, perRequestBudgetCents: Number(event.target.value || 0) }))
                }
              />
            </label>
            <label>
              Daily budget (cents)
              <input
                type="number"
                value={settings.dailyBudgetCents}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, dailyBudgetCents: Number(event.target.value || 0) }))
                }
              />
            </label>
            <label>
              Monthly budget (cents)
              <input
                type="number"
                value={settings.monthlyBudgetCents}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, monthlyBudgetCents: Number(event.target.value || 0) }))
                }
              />
            </label>
          </div>
        </section>

        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem", display: "grid", gap: "0.55rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Autocomplete and Memory</h2>
          <label>
            <input
              type="checkbox"
              checked={settings.autocompleteEnabled}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, autocompleteEnabled: event.target.checked }))
              }
            />
            Enable autocomplete (off by default)
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.autocompleteSensitiveDraftsBlocked}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  autocompleteSensitiveDraftsBlocked: event.target.checked,
                }))
              }
            />
            Never use autocomplete on sensitive drafts
          </label>
          <label>
            Autocomplete policy
            <textarea
              value={settings.autocompletePrompt}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, autocompletePrompt: event.target.value }))
              }
              rows={3}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.memoryEnabled}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, memoryEnabled: event.target.checked }))
              }
            />
            Enable memory
          </label>
          <label>
            Memory retention days
            <input
              type="number"
              value={settings.memoryRetentionDays}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, memoryRetentionDays: Number(event.target.value || 90) }))
              }
            />
          </label>
        </section>

        <section style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem", display: "grid", gap: "0.65rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Provider Keys (BYOK)</h2>
          {PROVIDERS.map((provider) => {
            const existing = keys.find((entry) => entry.provider === provider);
            return (
              <div key={provider} style={{ border: "1px solid #d8d2c7", background: "#fff", padding: "0.65rem" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{provider}</p>
                <p style={{ margin: "0.25rem 0", fontSize: "0.84rem", color: "#666" }}>
                  {existing
                    ? `Stored key • ****${existing.last4} • ${existing.status}`
                    : "No key configured"}
                </p>
                <input
                  type="password"
                  value={draftKeys[provider] ?? ""}
                  onChange={(event) =>
                    setDraftKeys((prev) => ({ ...prev, [provider]: event.target.value }))
                  }
                  placeholder={`Enter ${provider} API key`}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.45rem", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => void upsertKey(provider)} disabled={busy}>
                    Save / Rotate
                  </button>
                  <button type="button" onClick={() => void testKey(provider)} disabled={busy || !existing}>
                    Test
                  </button>
                  <button type="button" onClick={() => void keyAction(provider, "revoke")} disabled={busy || !existing}>
                    Revoke
                  </button>
                  <button type="button" onClick={() => void keyAction(provider, "delete")} disabled={busy || !existing}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button type="button" onClick={() => void saveSettings()} disabled={busy}>
            {busy ? "Saving..." : "Save settings"}
          </button>
          {message ? <span style={{ color: "#555" }}>{message}</span> : null}
        </div>
      </div>
    </div>
  );
}
