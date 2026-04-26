import { db } from "@/lib/db/client";
import { createHash, randomBytes } from "node:crypto";
import { decryptProviderKey, encryptProviderKey } from "@/lib/security/key-vault";
import { redactSecrets } from "@/lib/security/redaction";

/** PostgREST when tables are missing or the API schema cache is stale after migration. */
function creatorStudioTableMissingFromMessage(message: string): boolean {
  const m = message.toLowerCase();
  const mentionsCreatorTable =
    m.includes("creator_settings") ||
    m.includes("creator_provider_keys") ||
    m.includes("creator_memory_sessions") ||
    m.includes("creator_memory_summaries") ||
    m.includes("creator_audit_events") ||
    m.includes("creator_mfa_recovery_codes");
  if (!mentionsCreatorTable) return false;
  return (
    m.includes("schema cache") ||
    m.includes("could not find the table") ||
    m.includes("does not exist")
  );
}

export class CreatorStudioSchemaUnavailableError extends Error {
  override readonly name = "CreatorStudioSchemaUnavailableError";
  constructor() {
    super(
      "Creator Studio tables are missing or not visible to the API yet. Run lib/db/migrations/060_creator_studio_foundation.sql in the Supabase SQL editor, then open Project Settings → API → reload the schema cache."
    );
  }
}

export function isCreatorStudioSchemaUnavailableError(error: unknown): boolean {
  return (
    error instanceof CreatorStudioSchemaUnavailableError ||
    (error instanceof Error && creatorStudioTableMissingFromMessage(error.message))
  );
}

export type CreatorModelMode = "manual" | "auto" | "max";
export type ProviderKeyStatus = "active" | "revoked" | "invalid";
export type CreatorProvider = "anthropic" | "openai" | "gemini";

interface CreatorSettingsRow {
  user_id: string;
  model_mode: CreatorModelMode;
  default_provider: string | null;
  default_model: string | null;
  max_mode_enabled: boolean;
  max_mode_budget_cents: number;
  autocomplete_enabled: boolean;
  autocomplete_prompt: string;
  autocomplete_sensitive_drafts_blocked: boolean;
  memory_enabled: boolean;
  memory_retention_days: number;
  monthly_budget_cents: number;
  daily_budget_cents: number;
  per_request_budget_cents: number;
  created_at: string;
  updated_at: string;
}

interface CreatorProviderKeyRow {
  id: string;
  user_id: string;
  provider: CreatorProvider;
  key_ciphertext: string;
  key_iv: string;
  key_auth_tag: string;
  wrapped_dek: string;
  dek_wrap_iv: string;
  dek_wrap_auth_tag: string;
  key_last4: string;
  status: ProviderKeyStatus;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

interface CreatorMemorySessionRow {
  id: string;
  user_id: string;
  workflow_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  contains_pii: boolean;
  created_at: string;
  expires_at: string | null;
}

interface CreatorMemorySummaryRow {
  id: string;
  user_id: string;
  workflow_id: string;
  summary: string;
  source_count: number;
  created_at: string;
  expires_at: string | null;
}

export interface CreatorSettings {
  userId: string;
  modelMode: CreatorModelMode;
  defaultProvider: CreatorProvider | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface GetCreatorSettingsResult {
  settings: CreatorSettings;
  /** False when `creator_settings` is missing from PostgREST (migration not applied or schema cache stale). */
  schemaAvailable: boolean;
}

export interface ListCreatorProviderKeysResult {
  keys: CreatorProviderKeyMetadata[];
  schemaAvailable: boolean;
}

function defaultCreatorSettings(userId: string): CreatorSettings {
  const now = new Date().toISOString();
  return {
    userId,
    modelMode: "manual",
    defaultProvider: null,
    defaultModel: null,
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
    createdAt: now,
    updatedAt: now,
  };
}

export interface CreatorProviderKeyMetadata {
  id: string;
  provider: CreatorProvider;
  last4: string;
  status: ProviderKeyStatus;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface CreatorMemorySession {
  id: string;
  workflowId: string;
  role: "user" | "assistant" | "system";
  content: string;
  containsPii: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface CreatorMemorySummary {
  id: string;
  workflowId: string;
  summary: string;
  sourceCount: number;
  createdAt: string;
  expiresAt: string | null;
}

function rowToSettings(row: CreatorSettingsRow): CreatorSettings {
  return {
    userId: row.user_id,
    modelMode: row.model_mode,
    defaultProvider: (row.default_provider as CreatorProvider | null) ?? null,
    defaultModel: row.default_model ?? null,
    maxModeEnabled: row.max_mode_enabled,
    maxModeBudgetCents: row.max_mode_budget_cents ?? 0,
    autocompleteEnabled: row.autocomplete_enabled,
    autocompletePrompt: row.autocomplete_prompt ?? "",
    autocompleteSensitiveDraftsBlocked: row.autocomplete_sensitive_drafts_blocked,
    memoryEnabled: row.memory_enabled,
    memoryRetentionDays: row.memory_retention_days ?? 90,
    monthlyBudgetCents: row.monthly_budget_cents ?? 0,
    dailyBudgetCents: row.daily_budget_cents ?? 0,
    perRequestBudgetCents: row.per_request_budget_cents ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToProviderKeyMetadata(row: CreatorProviderKeyRow): CreatorProviderKeyMetadata {
  return {
    id: row.id,
    provider: row.provider,
    last4: row.key_last4,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}

function rowToMemorySession(row: CreatorMemorySessionRow): CreatorMemorySession {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    role: row.role,
    content: row.content,
    containsPii: row.contains_pii,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function rowToMemorySummary(row: CreatorMemorySummaryRow): CreatorMemorySummary {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    summary: row.summary,
    sourceCount: row.source_count,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function retentionExpiryIso(retentionDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Math.max(1, Math.trunc(retentionDays)));
  return date.toISOString();
}

export async function upsertCreatorSettings(
  userId: string,
  partial: Partial<Omit<CreatorSettings, "userId" | "createdAt" | "updatedAt">>
): Promise<CreatorSettings> {
  const row = {
    user_id: userId,
    ...(partial.modelMode !== undefined ? { model_mode: partial.modelMode } : {}),
    ...(partial.defaultProvider !== undefined ? { default_provider: partial.defaultProvider } : {}),
    ...(partial.defaultModel !== undefined ? { default_model: partial.defaultModel } : {}),
    ...(partial.maxModeEnabled !== undefined ? { max_mode_enabled: partial.maxModeEnabled } : {}),
    ...(partial.maxModeBudgetCents !== undefined
      ? { max_mode_budget_cents: Math.max(0, Math.trunc(partial.maxModeBudgetCents)) }
      : {}),
    ...(partial.autocompleteEnabled !== undefined
      ? { autocomplete_enabled: partial.autocompleteEnabled }
      : {}),
    ...(partial.autocompletePrompt !== undefined
      ? { autocomplete_prompt: partial.autocompletePrompt.slice(0, 2_000) }
      : {}),
    ...(partial.autocompleteSensitiveDraftsBlocked !== undefined
      ? { autocomplete_sensitive_drafts_blocked: partial.autocompleteSensitiveDraftsBlocked }
      : {}),
    ...(partial.memoryEnabled !== undefined ? { memory_enabled: partial.memoryEnabled } : {}),
    ...(partial.memoryRetentionDays !== undefined
      ? { memory_retention_days: Math.max(1, Math.trunc(partial.memoryRetentionDays)) }
      : {}),
    ...(partial.monthlyBudgetCents !== undefined
      ? { monthly_budget_cents: Math.max(0, Math.trunc(partial.monthlyBudgetCents)) }
      : {}),
    ...(partial.dailyBudgetCents !== undefined
      ? { daily_budget_cents: Math.max(0, Math.trunc(partial.dailyBudgetCents)) }
      : {}),
    ...(partial.perRequestBudgetCents !== undefined
      ? { per_request_budget_cents: Math.max(0, Math.trunc(partial.perRequestBudgetCents)) }
      : {}),
  };
  const { data, error } = await db
    .from("creator_settings")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      throw new CreatorStudioSchemaUnavailableError();
    }
    throw new Error(`upsertCreatorSettings: ${error.message}`);
  }
  return rowToSettings(data as CreatorSettingsRow);
}

export async function getCreatorSettings(userId: string): Promise<GetCreatorSettingsResult> {
  const { data, error } = await db
    .from("creator_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      return { settings: defaultCreatorSettings(userId), schemaAvailable: false };
    }
    throw new Error(`getCreatorSettings: ${error.message}`);
  }
  if (data) return { settings: rowToSettings(data as CreatorSettingsRow), schemaAvailable: true };
  try {
    const settings = await upsertCreatorSettings(userId, {});
    return { settings, schemaAvailable: true };
  } catch (e: unknown) {
    if (isCreatorStudioSchemaUnavailableError(e)) {
      return { settings: defaultCreatorSettings(userId), schemaAvailable: false };
    }
    throw e;
  }
}

export async function listCreatorProviderKeys(userId: string): Promise<ListCreatorProviderKeysResult> {
  const { data, error } = await db
    .from("creator_provider_keys")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      return { keys: [], schemaAvailable: false };
    }
    throw new Error(`listCreatorProviderKeys: ${error.message}`);
  }
  return { keys: (data as CreatorProviderKeyRow[]).map(rowToProviderKeyMetadata), schemaAvailable: true };
}

export async function upsertCreatorProviderKey(input: {
  userId: string;
  provider: CreatorProvider;
  apiKey: string;
}): Promise<CreatorProviderKeyMetadata> {
  const encrypted = encryptProviderKey(input.apiKey);
  const row = {
    user_id: input.userId,
    provider: input.provider,
    key_ciphertext: encrypted.keyCiphertext,
    key_iv: encrypted.keyIv,
    key_auth_tag: encrypted.keyAuthTag,
    wrapped_dek: encrypted.wrappedDek,
    dek_wrap_iv: encrypted.dekWrapIv,
    dek_wrap_auth_tag: encrypted.dekWrapAuthTag,
    key_last4: encrypted.last4,
    status: "active" as const,
  };
  const { data, error } = await db
    .from("creator_provider_keys")
    .upsert(row, { onConflict: "user_id,provider" })
    .select("*")
    .single();
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      throw new CreatorStudioSchemaUnavailableError();
    }
    throw new Error(`upsertCreatorProviderKey: ${error.message}`);
  }
  return rowToProviderKeyMetadata(data as CreatorProviderKeyRow);
}

export async function setCreatorProviderKeyStatus(input: {
  userId: string;
  provider: CreatorProvider;
  status: ProviderKeyStatus;
}): Promise<CreatorProviderKeyMetadata | null> {
  const { data, error } = await db
    .from("creator_provider_keys")
    .update({ status: input.status })
    .eq("user_id", input.userId)
    .eq("provider", input.provider)
    .select("*")
    .maybeSingle();
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      throw new CreatorStudioSchemaUnavailableError();
    }
    throw new Error(`setCreatorProviderKeyStatus: ${error.message}`);
  }
  if (!data) return null;
  return rowToProviderKeyMetadata(data as CreatorProviderKeyRow);
}

export async function deleteCreatorProviderKey(input: {
  userId: string;
  provider: CreatorProvider;
}): Promise<void> {
  const { error } = await db
    .from("creator_provider_keys")
    .delete()
    .eq("user_id", input.userId)
    .eq("provider", input.provider);
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      throw new CreatorStudioSchemaUnavailableError();
    }
    throw new Error(`deleteCreatorProviderKey: ${error.message}`);
  }
}

export async function getCreatorProviderApiKey(input: {
  userId: string;
  provider: CreatorProvider;
}): Promise<string | null> {
  const { data, error } = await db
    .from("creator_provider_keys")
    .select("*")
    .eq("user_id", input.userId)
    .eq("provider", input.provider)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      throw new CreatorStudioSchemaUnavailableError();
    }
    throw new Error(`getCreatorProviderApiKey: ${error.message}`);
  }
  if (!data) return null;
  const row = data as CreatorProviderKeyRow;
  const plaintext = decryptProviderKey({
    keyCiphertext: row.key_ciphertext,
    keyIv: row.key_iv,
    keyAuthTag: row.key_auth_tag,
    wrappedDek: row.wrapped_dek,
    dekWrapIv: row.dek_wrap_iv,
    dekWrapAuthTag: row.dek_wrap_auth_tag,
  });
  await db
    .from("creator_provider_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);
  return plaintext;
}

export async function createCreatorAuditEvent(input: {
  userId: string;
  actorUserId: string;
  eventType: string;
  route?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await db.from("creator_audit_events").insert({
    user_id: input.userId,
    actor_user_id: input.actorUserId,
    event_type: input.eventType,
    route: input.route ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      console.warn("[creatorStudio] audit event skipped (schema unavailable)", input.eventType);
      return;
    }
    throw new Error(`createCreatorAuditEvent: ${error.message}`);
  }
}

export async function listCreatorAuditEvents(userId: string, limit = 100) {
  const { data, error } = await db
    .from("creator_audit_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, Math.trunc(limit))));
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) return [];
    throw new Error(`listCreatorAuditEvents: ${error.message}`);
  }
  return data ?? [];
}

function hashRecoveryCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

export async function regenerateCreatorRecoveryCodes(userId: string): Promise<string[]> {
  await db.from("creator_mfa_recovery_codes").delete().eq("user_id", userId);
  const codes = Array.from({ length: 10 }).map(() => randomBytes(4).toString("hex").toUpperCase());
  const rows = codes.map((code) => ({
    user_id: userId,
    code_hash: hashRecoveryCode(userId, code),
  }));
  const { error } = await db.from("creator_mfa_recovery_codes").insert(rows);
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      throw new CreatorStudioSchemaUnavailableError();
    }
    throw new Error(`regenerateCreatorRecoveryCodes: ${error.message}`);
  }
  return codes;
}

export async function listCreatorRecoveryCodeStates(userId: string) {
  const { data, error } = await db
    .from("creator_mfa_recovery_codes")
    .select("id, used_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) return [];
    throw new Error(`listCreatorRecoveryCodeStates: ${error.message}`);
  }
  return data ?? [];
}

export async function consumeCreatorRecoveryCode(input: {
  userId: string;
  code: string;
}): Promise<boolean> {
  const hash = hashRecoveryCode(input.userId, input.code.trim().toUpperCase());
  const { data, error } = await db
    .from("creator_mfa_recovery_codes")
    .select("id, used_at")
    .eq("user_id", input.userId)
    .eq("code_hash", hash)
    .maybeSingle();
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      throw new CreatorStudioSchemaUnavailableError();
    }
    throw new Error(`consumeCreatorRecoveryCode: ${error.message}`);
  }
  if (!data) return false;
  if ((data as { used_at?: string | null }).used_at) return false;
  const { error: updateError } = await db
    .from("creator_mfa_recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", (data as { id: string }).id);
  if (updateError) throw new Error(`consumeCreatorRecoveryCode update: ${updateError.message}`);
  return true;
}

export async function createCreatorMemorySession(input: {
  userId: string;
  workflowId: string;
  role: "user" | "assistant" | "system";
  content: string;
  containsPii?: boolean;
  retentionDays: number;
}): Promise<CreatorMemorySession> {
  const sanitized = redactSecrets(input.content).slice(0, 8_000);
  const { data, error } = await db
    .from("creator_memory_sessions")
    .insert({
      user_id: input.userId,
      workflow_id: input.workflowId,
      role: input.role,
      content: sanitized,
      contains_pii: input.containsPii === true,
      expires_at: retentionExpiryIso(input.retentionDays),
    })
    .select("*")
    .single();
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      throw new CreatorStudioSchemaUnavailableError();
    }
    throw new Error(`createCreatorMemorySession: ${error.message}`);
  }
  return rowToMemorySession(data as CreatorMemorySessionRow);
}

export async function listCreatorMemory(input: {
  userId: string;
  workflowId?: string;
  limit?: number;
}): Promise<CreatorMemorySession[]> {
  let query = db
    .from("creator_memory_sessions")
    .select("*")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100))));
  if (input.workflowId) query = query.eq("workflow_id", input.workflowId);
  const { data, error } = await query;
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) return [];
    throw new Error(`listCreatorMemory: ${error.message}`);
  }
  return (data as CreatorMemorySessionRow[]).map(rowToMemorySession);
}

export async function deleteCreatorMemory(input: {
  userId: string;
  workflowId?: string;
}): Promise<void> {
  let query = db.from("creator_memory_sessions").delete().eq("user_id", input.userId);
  if (input.workflowId) query = query.eq("workflow_id", input.workflowId);
  const { error } = await query;
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      throw new CreatorStudioSchemaUnavailableError();
    }
    throw new Error(`deleteCreatorMemory: ${error.message}`);
  }
}

export async function upsertCreatorMemorySummary(input: {
  userId: string;
  workflowId: string;
  summary: string;
  sourceCount: number;
  retentionDays: number;
}): Promise<CreatorMemorySummary> {
  const row = {
    user_id: input.userId,
    workflow_id: input.workflowId,
    summary: redactSecrets(input.summary).slice(0, 8_000),
    source_count: Math.max(0, Math.trunc(input.sourceCount)),
    expires_at: retentionExpiryIso(input.retentionDays),
  };
  const { data, error } = await db
    .from("creator_memory_summaries")
    .insert(row)
    .select("*")
    .single();
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) {
      throw new CreatorStudioSchemaUnavailableError();
    }
    throw new Error(`upsertCreatorMemorySummary: ${error.message}`);
  }
  return rowToMemorySummary(data as CreatorMemorySummaryRow);
}

export async function listCreatorMemorySummaries(input: {
  userId: string;
  workflowId?: string;
  limit?: number;
}): Promise<CreatorMemorySummary[]> {
  let query = db
    .from("creator_memory_summaries")
    .select("*")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Math.trunc(input.limit ?? 30))));
  if (input.workflowId) query = query.eq("workflow_id", input.workflowId);
  const { data, error } = await query;
  if (error) {
    if (creatorStudioTableMissingFromMessage(error.message)) return [];
    throw new Error(`listCreatorMemorySummaries: ${error.message}`);
  }
  return (data as CreatorMemorySummaryRow[]).map(rowToMemorySummary);
}
