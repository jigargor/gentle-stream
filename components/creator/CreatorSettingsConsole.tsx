"use client";

import Link from "next/link";
import { CreatorBetaPill } from "@/components/creator/creator-beta-pill";
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

async function readCreatorApiErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  const message = body?.error?.trim();
  return message && message.length > 0 ? message : fallback;
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

const CREATOR_DB_UNAVAILABLE_NOTICE =
  "Creator Studio tables are not visible to the API yet. Run lib/db/migrations/060_creator_studio_foundation.sql in the Supabase SQL editor, then reload the schema cache under Project Settings → API. The form shows defaults; saves and keys will not persist until then.";

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
  const [keysLoading, setKeysLoading] = useState(true);

  async function loadSettingsOnly() {
    const started = Date.now();
    const settingsRes = await fetch("/api/creator/settings");
    if (Date.now() - started > 30) console.info(`[creator-settings] settings GET ${Date.now() - started}ms`);
    if (settingsRes.headers.get("X-Gentle-Stream-Creator-Db") === "unavailable") {
      setSchemaNotice(CREATOR_DB_UNAVAILABLE_NOTICE);
    }
    if (settingsRes.ok) {
      setSettings((await settingsRes.json()) as CreatorSettingsResponse);
    }
  }

  async function loadProviderKeysOnly() {
    setKeysLoading(true);
    const started = Date.now();
    try {
      const keysRes = await fetch("/api/creator/settings/provider-keys");
      if (Date.now() - started > 30) console.info(`[creator-settings] provider-keys GET ${Date.now() - started}ms`);
      if (keysRes.headers.get("X-Gentle-Stream-Creator-Db") === "unavailable") {
        setSchemaNotice(CREATOR_DB_UNAVAILABLE_NOTICE);
      }
      if (keysRes.ok) {
        const payload = (await keysRes.json()) as { keys?: ProviderKeyMeta[] };
        setKeys(payload.keys ?? []);
      }
    } finally {
      setKeysLoading(false);
    }
  }

  async function loadState() {
    await Promise.all([loadSettingsOnly(), loadProviderKeysOnly()]);
  }

  useEffect(() => {
    void loadSettingsOnly();
    void loadProviderKeysOnly();
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
        setMessage(await readCreatorApiErrorMessage(res, "Could not save settings."));
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
        setMessage(await readCreatorApiErrorMessage(res, `Could not save ${provider} key.`));
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
        setMessage(await readCreatorApiErrorMessage(res, `Could not ${action} ${provider} key.`));
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
        setMessage(await readCreatorApiErrorMessage(res, `${provider} test failed.`));
        return;
      }
      setMessage(`${provider} key is healthy.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="creator-studio">
      <div className="creator-studio__shell">
        <header className="creator-commandbar">
          <div className="creator-commandbar__copy">
            <p className="creator-eyebrow">Creator controls</p>
            <div className="creator-commandbar__title-row">
              <h1>Creator Settings</h1>
              <CreatorBetaPill />
            </div>
            <p>Bring-your-own-key model controls, budgets, autocomplete, and memory policy.</p>
          </div>
          <nav className="creator-commandbar__actions" aria-label="Creator settings navigation">
            <Link className="creator-action-link" href="/creator">Back to Writing</Link>
            <Link className="creator-action-link" href="/creator/usage">Usage</Link>
          </nav>
        </header>

        {schemaNotice ? <section className="creator-note creator-note--warning" role="status">{schemaNotice}</section> : null}

        <div className="creator-settings-grid">
          <section className="creator-panel">
            <div className="creator-panel__heading"><div><p className="creator-eyebrow">Routing</p><h2>Model Router</h2></div></div>
            <div className="creator-field-grid">
              <label className="creator-field"><span>Mode</span><select className="creator-input" value={settings.modelMode} onChange={(event) => setSettings((prev) => ({ ...prev, modelMode: event.target.value as CreatorSettingsResponse["modelMode"] }))}><option value="manual">Manual</option><option value="auto">Auto</option><option value="max">Max</option></select></label>
              <label className="creator-field"><span>Default provider</span><select className="creator-input" value={settings.defaultProvider ?? ""} onChange={(event) => setSettings((prev) => ({ ...prev, defaultProvider: (event.target.value || null) as CreatorSettingsResponse["defaultProvider"] }))}><option value="">None</option>{PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
              <label className="creator-field creator-field--wide"><span>Default model</span><input className="creator-input" value={settings.defaultModel ?? ""} onChange={(event) => setSettings((prev) => ({ ...prev, defaultModel: event.target.value }))} placeholder="e.g. claude-sonnet-4-20250514" /></label>
              <label className="creator-check-row"><input type="checkbox" checked={settings.maxModeEnabled} onChange={(event) => setSettings((prev) => ({ ...prev, maxModeEnabled: event.target.checked }))} />Enable max mode</label>
              <label className="creator-field"><span>Max budget (cents)</span><input className="creator-input" type="number" value={settings.maxModeBudgetCents} onChange={(event) => setSettings((prev) => ({ ...prev, maxModeBudgetCents: Number(event.target.value || 0) }))} /></label>
              <label className="creator-field"><span>Per request budget</span><input className="creator-input" type="number" value={settings.perRequestBudgetCents} onChange={(event) => setSettings((prev) => ({ ...prev, perRequestBudgetCents: Number(event.target.value || 0) }))} /></label>
              <label className="creator-field"><span>Daily budget</span><input className="creator-input" type="number" value={settings.dailyBudgetCents} onChange={(event) => setSettings((prev) => ({ ...prev, dailyBudgetCents: Number(event.target.value || 0) }))} /></label>
              <label className="creator-field"><span>Monthly budget</span><input className="creator-input" type="number" value={settings.monthlyBudgetCents} onChange={(event) => setSettings((prev) => ({ ...prev, monthlyBudgetCents: Number(event.target.value || 0) }))} /></label>
            </div>
          </section>

          <section className="creator-panel">
            <div className="creator-panel__heading"><div><p className="creator-eyebrow">Assist</p><h2>Autocomplete and Memory</h2></div></div>
            <div className="creator-settings-grid">
              <label className="creator-check-row"><input type="checkbox" checked={settings.autocompleteEnabled} onChange={(event) => setSettings((prev) => ({ ...prev, autocompleteEnabled: event.target.checked }))} />Enable autocomplete</label>
              <label className="creator-check-row"><input type="checkbox" checked={settings.autocompleteSensitiveDraftsBlocked} onChange={(event) => setSettings((prev) => ({ ...prev, autocompleteSensitiveDraftsBlocked: event.target.checked }))} />Never use autocomplete on sensitive drafts</label>
              <label className="creator-field creator-field--wide"><span>Autocomplete policy</span><textarea className="creator-textarea" value={settings.autocompletePrompt} onChange={(event) => setSettings((prev) => ({ ...prev, autocompletePrompt: event.target.value }))} rows={3} /></label>
              <label className="creator-check-row"><input type="checkbox" checked={settings.memoryEnabled} onChange={(event) => setSettings((prev) => ({ ...prev, memoryEnabled: event.target.checked }))} />Enable memory</label>
              <label className="creator-field"><span>Memory retention days</span><input className="creator-input" type="number" value={settings.memoryRetentionDays} onChange={(event) => setSettings((prev) => ({ ...prev, memoryRetentionDays: Number(event.target.value || 90) }))} /></label>
            </div>
          </section>

          <section className="creator-panel">
            <div className="creator-panel__heading"><div><p className="creator-eyebrow">BYOK</p><h2>Provider Keys</h2></div></div>
            <p className="creator-note creator-note--warning" role="note">
              Saving, testing, or removing provider API keys requires multi-factor authentication (MFA). Enable MFA under{" "}
              <Link className="creator-action-link" href="/account/settings">
                Account settings
              </Link>{" "}
              (Security), complete setup, then sign in with MFA before managing keys here.
            </p>
            {keysLoading ? <p className="creator-muted">Loading provider key status...</p> : null}
            <div className="creator-settings-grid">
              {PROVIDERS.map((provider) => {
                const existing = keys.find((entry) => entry.provider === provider);
                return (
                  <div key={provider} className="creator-mini-card">
                    <strong>{provider}</strong>
                    <span>{existing ? "Stored key / ****" + existing.last4 + " / " + existing.status : "No key configured"}</span>
                    <input className="creator-input" type="password" value={draftKeys[provider] ?? ""} onChange={(event) => setDraftKeys((prev) => ({ ...prev, [provider]: event.target.value }))} placeholder={"Enter " + provider + " API key"} />
                    <div className="creator-button-row">
                      <button className="creator-button creator-button--small" type="button" onClick={() => void upsertKey(provider)} disabled={busy || keysLoading}>Save / Rotate</button>
                      <button className="creator-button creator-button--small" type="button" onClick={() => void testKey(provider)} disabled={busy || keysLoading || !existing}>Test</button>
                      <button className="creator-button creator-button--small creator-button--ghost" type="button" onClick={() => void keyAction(provider, "revoke")} disabled={busy || keysLoading || !existing}>Revoke</button>
                      <button className="creator-button creator-button--small creator-button--danger" type="button" onClick={() => void keyAction(provider, "delete")} disabled={busy || keysLoading || !existing}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="creator-editor__footer">
            <button className="creator-button creator-button--primary" type="button" onClick={() => void saveSettings()} disabled={busy}>{busy ? "Saving..." : "Save settings"}</button>
            {message ? <span className="creator-status-pill creator-status-pill--neutral">{message}</span> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
