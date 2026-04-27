"use client";

import Link from "next/link";
import { CreatorBetaPill } from "@/components/creator/creator-beta-pill";
import { useEffect, useRef, useState } from "react";
import { PanelSaveStatus, type PanelSaveStatusState } from "@/components/creator/PanelSaveStatus";
import { ALL_KNOWN_MODEL_IDS, KNOWN_MODELS } from "@/lib/creator/known-models";

interface CreatorSettingsResponse {
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

export function CreatorSettingsConsole({ hasMfa = false }: { hasMfa?: boolean }) {
  const [settings, setSettings] = useState<CreatorSettingsResponse>(DEFAULT_SETTINGS);
  const [keys, setKeys] = useState<ProviderKeyMeta[]>([]);
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [schemaNotice, setSchemaNotice] = useState<string | null>(null);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);

  // Per-panel auto-save status
  const [routerStatus, setRouterStatus] = useState<PanelSaveStatusState>("idle");
  const [routerError, setRouterError] = useState<string | null>(null);
  const [assistStatus, setAssistStatus] = useState<PanelSaveStatusState>("idle");
  const [assistError, setAssistError] = useState<string | null>(null);

  // Guard: skip auto-save effects until initial data is loaded
  const loadedRef = useRef(false);
  // Always holds the latest settings so async timer callbacks never use stale data
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Derived: is the current defaultModel outside the known list?
  const isCustomModel =
    !!settings.defaultModel && !ALL_KNOWN_MODEL_IDS.has(settings.defaultModel);
  const [showCustomModel, setShowCustomModel] = useState(false);

  async function loadSettingsOnly() {
    const settingsRes = await fetch("/api/creator/settings");
    if (settingsRes.headers.get("X-Gentle-Stream-Creator-Db") === "unavailable") {
      setSchemaNotice(CREATOR_DB_UNAVAILABLE_NOTICE);
    }
    if (settingsRes.ok) {
      const data = (await settingsRes.json()) as CreatorSettingsResponse;
      setSettings(data);
      // If stored model is a custom string, show the custom input
      if (data.defaultModel && !ALL_KNOWN_MODEL_IDS.has(data.defaultModel)) {
        setShowCustomModel(true);
      }
    }
  }

  async function loadProviderKeysOnly() {
    setKeysLoading(true);
    try {
      const keysRes = await fetch("/api/creator/settings/provider-keys");
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

  useEffect(() => {
    void Promise.all([loadSettingsOnly(), loadProviderKeysOnly()]).then(() => {
      loadedRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Auto-save: Router panel fields
  useEffect(() => {
    if (!loadedRef.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setRouterStatus("saving");
      setRouterError(null);
      try {
        const res = await fetch("/api/creator/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildSettingsPatchBody(settingsRef.current)),
        });
        if (cancelled) return;
        if (!res.ok) {
          setRouterStatus("error");
          setRouterError(await readCreatorApiErrorMessage(res, "Could not save settings."));
        } else {
          setRouterStatus("saved");
          setTimeout(() => { if (!cancelled) setRouterStatus("idle"); }, 2000);
        }
      } catch {
        if (!cancelled) setRouterStatus("error");
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.modelMode,
    settings.defaultProvider,
    settings.defaultModel,
    settings.maxModeEnabled,
    settings.maxModeBudgetCents,
    settings.perRequestBudgetCents,
    settings.dailyBudgetCents,
    settings.monthlyBudgetCents,
  ]);

  // Auto-save: Assist panel fields
  useEffect(() => {
    if (!loadedRef.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setAssistStatus("saving");
      setAssistError(null);
      try {
        const res = await fetch("/api/creator/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildSettingsPatchBody(settingsRef.current)),
        });
        if (cancelled) return;
        if (!res.ok) {
          setAssistStatus("error");
          setAssistError(await readCreatorApiErrorMessage(res, "Could not save settings."));
        } else {
          setAssistStatus("saved");
          setTimeout(() => { if (!cancelled) setAssistStatus("idle"); }, 2000);
        }
      } catch {
        if (!cancelled) setAssistStatus("error");
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.autocompleteEnabled,
    settings.autocompletePrompt,
    settings.autocompleteSensitiveDraftsBlocked,
    settings.memoryEnabled,
    settings.memoryRetentionDays,
  ]);

  async function upsertKey(provider: ProviderKeyMeta["provider"]) {
    const apiKey = (draftKeys[provider] ?? "").trim();
    if (!apiKey) {
      setKeyMessage(`Enter a ${provider} key first.`);
      return;
    }
    setKeyBusy(true);
    setKeyMessage(null);
    try {
      const res = await fetch("/api/creator/settings/provider-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action: "upsert", apiKey }),
      });
      if (!res.ok) {
        setKeyMessage(await readCreatorApiErrorMessage(res, `Could not save ${provider} key.`));
        return;
      }
      setDraftKeys((prev) => ({ ...prev, [provider]: "" }));
      setKeyMessage(`${provider} key saved.`);
      await loadProviderKeysOnly();
    } finally {
      setKeyBusy(false);
    }
  }

  async function keyAction(provider: ProviderKeyMeta["provider"], action: "revoke" | "delete") {
    setKeyBusy(true);
    setKeyMessage(null);
    try {
      const res = await fetch("/api/creator/settings/provider-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action }),
      });
      if (!res.ok) {
        setKeyMessage(await readCreatorApiErrorMessage(res, `Could not ${action} ${provider} key.`));
        return;
      }
      setKeyMessage(`${provider} key ${action}d.`);
      await loadProviderKeysOnly();
    } finally {
      setKeyBusy(false);
    }
  }

  async function testKey(provider: ProviderKeyMeta["provider"]) {
    setKeyBusy(true);
    setKeyMessage(null);
    try {
      const res = await fetch("/api/creator/settings/provider-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        setKeyMessage(await readCreatorApiErrorMessage(res, `${provider} test failed.`));
        return;
      }
      setKeyMessage(`${provider} key is healthy.`);
    } finally {
      setKeyBusy(false);
    }
  }

  // Model dropdown: options filtered by provider
  const providerModels = settings.defaultProvider
    ? (KNOWN_MODELS[settings.defaultProvider] ?? [])
    : (Object.entries(KNOWN_MODELS) as [string, { id: string; label: string }[]][]).flatMap(
        ([p, models]) => models.map((m) => ({ ...m, groupLabel: p }))
      );

  // The select value: known model id, "other", or ""
  const modelSelectValue = showCustomModel
    ? "other"
    : (settings.defaultModel ?? "");

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

        {schemaNotice ? (
          <section className="creator-note creator-note--warning" role="status">
            {schemaNotice}
          </section>
        ) : null}

        <div className="creator-settings-grid">
          {/* ── Model Router ─────────────────────────────────────────── */}
          <section className="creator-panel">
            <div className="creator-panel__heading">
              <div>
                <p className="creator-eyebrow">Routing</p>
                <h2>Model Router</h2>
              </div>
              <PanelSaveStatus status={routerStatus} errorText={routerError} />
            </div>
            <div className="creator-field-grid">
              <label className="creator-field">
                <span>Mode</span>
                <select
                  className="creator-input"
                  value={settings.modelMode}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      modelMode: e.target.value as CreatorSettingsResponse["modelMode"],
                    }))
                  }
                >
                  <option value="manual">Manual</option>
                  <option value="auto">Auto</option>
                  <option value="max">Max</option>
                </select>
              </label>

              <label className="creator-field">
                <span>Default provider</span>
                <select
                  className="creator-input"
                  value={settings.defaultProvider ?? ""}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      defaultProvider: (e.target.value || null) as CreatorSettingsResponse["defaultProvider"],
                      // Clear the model when provider changes so the user picks from the new list
                      defaultModel: "",
                    }))
                  }
                >
                  <option value="">None</option>
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label className="creator-field creator-field--wide">
                <span>Default model</span>
                <select
                  className="creator-input"
                  value={modelSelectValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "other") {
                      setShowCustomModel(true);
                      setSettings((prev) => ({ ...prev, defaultModel: "" }));
                    } else {
                      setShowCustomModel(false);
                      setSettings((prev) => ({ ...prev, defaultModel: val || null }));
                    }
                  }}
                >
                  <option value="">None</option>
                  {settings.defaultProvider
                    ? providerModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))
                    : (Object.entries(KNOWN_MODELS) as [string, { id: string; label: string }[]][]).map(
                        ([providerName, models]) => (
                          <optgroup key={providerName} label={providerName}>
                            {models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </optgroup>
                        )
                      )}
                  <option value="other">Other (custom)…</option>
                </select>
                {showCustomModel || isCustomModel ? (
                  <input
                    className="creator-input"
                    style={{ marginTop: "0.35rem" }}
                    value={settings.defaultModel ?? ""}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, defaultModel: e.target.value }))
                    }
                    placeholder="e.g. claude-sonnet-4-20250514"
                  />
                ) : null}
              </label>

              <label className="creator-check-row">
                <input
                  type="checkbox"
                  checked={settings.maxModeEnabled}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, maxModeEnabled: e.target.checked }))
                  }
                />
                Enable max mode
              </label>

              <label className="creator-field">
                <span>Max budget (cents)</span>
                <input
                  className="creator-input"
                  type="number"
                  value={settings.maxModeBudgetCents}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      maxModeBudgetCents: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="creator-field">
                <span>Per request budget</span>
                <input
                  className="creator-input"
                  type="number"
                  value={settings.perRequestBudgetCents}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      perRequestBudgetCents: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="creator-field">
                <span>Daily budget</span>
                <input
                  className="creator-input"
                  type="number"
                  value={settings.dailyBudgetCents}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      dailyBudgetCents: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="creator-field">
                <span>Monthly budget</span>
                <input
                  className="creator-input"
                  type="number"
                  value={settings.monthlyBudgetCents}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      monthlyBudgetCents: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>
            </div>
          </section>

          {/* ── Autocomplete and Memory ───────────────────────────────── */}
          <section className="creator-panel">
            <div className="creator-panel__heading">
              <div>
                <p className="creator-eyebrow">Assist</p>
                <h2>Autocomplete and Memory</h2>
              </div>
              <PanelSaveStatus status={assistStatus} errorText={assistError} />
            </div>
            <div className="creator-settings-grid">
              <label className="creator-check-row">
                <input
                  type="checkbox"
                  checked={settings.autocompleteEnabled}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, autocompleteEnabled: e.target.checked }))
                  }
                />
                Enable autocomplete
              </label>
              <label className="creator-check-row">
                <input
                  type="checkbox"
                  checked={settings.autocompleteSensitiveDraftsBlocked}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      autocompleteSensitiveDraftsBlocked: e.target.checked,
                    }))
                  }
                />
                Never use autocomplete on sensitive drafts
              </label>
              <label className="creator-field creator-field--wide">
                <span>Autocomplete policy</span>
                <textarea
                  className="creator-textarea"
                  value={settings.autocompletePrompt}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, autocompletePrompt: e.target.value }))
                  }
                  rows={3}
                />
              </label>
              <label className="creator-check-row">
                <input
                  type="checkbox"
                  checked={settings.memoryEnabled}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, memoryEnabled: e.target.checked }))
                  }
                />
                Enable memory
              </label>
              <label className="creator-field">
                <span>Memory retention days</span>
                <input
                  className="creator-input"
                  type="number"
                  value={settings.memoryRetentionDays}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      memoryRetentionDays: Number(e.target.value || 90),
                    }))
                  }
                />
              </label>
            </div>
          </section>

          {/* ── Provider Keys (BYOK) ──────────────────────────────────── */}
          <section className="creator-panel">
            <div className="creator-panel__heading">
              <div>
                <p className="creator-eyebrow">BYOK</p>
                <h2>Provider Keys</h2>
              </div>
            </div>
            {!hasMfa ? (
              <p className="creator-note" role="note">
                API keys are encrypted at rest. For an extra layer of protection, consider enabling
                MFA in{" "}
                <Link className="creator-action-link" href="/account/settings">
                  Account settings
                </Link>{" "}
                — saving or rotating keys will then require a one-time code.
              </p>
            ) : (
              <p className="creator-note creator-note--warning" role="note">
                Saving, testing, or removing provider API keys requires MFA step-up verification.
                Sign in with your authenticator app before managing keys here.
              </p>
            )}
            {keysLoading ? <p className="creator-muted">Loading provider key status...</p> : null}
            {keyMessage ? (
              <p className="creator-muted" role="status">
                {keyMessage}
              </p>
            ) : null}
            <div className="creator-settings-grid">
              {PROVIDERS.map((provider) => {
                const existing = keys.find((k) => k.provider === provider);
                return (
                  <div key={provider} className="creator-mini-card">
                    <strong>{provider}</strong>
                    <span>
                      {existing
                        ? "Stored key / ****" + existing.last4 + " / " + existing.status
                        : "No key configured"}
                    </span>
                    <input
                      className="creator-input"
                      type="password"
                      value={draftKeys[provider] ?? ""}
                      onChange={(e) =>
                        setDraftKeys((prev) => ({ ...prev, [provider]: e.target.value }))
                      }
                      placeholder={"Enter " + provider + " API key"}
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore
                    />
                    <div className="creator-button-row">
                      <button
                        className="creator-button creator-button--small"
                        type="button"
                        onClick={() => void upsertKey(provider)}
                        disabled={keyBusy || keysLoading}
                      >
                        Save / Rotate
                      </button>
                      <button
                        className="creator-button creator-button--small"
                        type="button"
                        onClick={() => void testKey(provider)}
                        disabled={keyBusy || keysLoading || !existing}
                      >
                        Test
                      </button>
                      <button
                        className="creator-button creator-button--small creator-button--ghost"
                        type="button"
                        onClick={() => void keyAction(provider, "revoke")}
                        disabled={keyBusy || keysLoading || !existing}
                      >
                        Revoke
                      </button>
                      <button
                        className="creator-button creator-button--small creator-button--danger"
                        type="button"
                        onClick={() => void keyAction(provider, "delete")}
                        disabled={keyBusy || keysLoading || !existing}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
