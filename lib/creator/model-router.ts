import { db } from "@/lib/db/client";
import {
  type CreatorModelMode,
  type CreatorProvider,
  getCreatorProviderApiKey,
  getCreatorSettings,
} from "@/lib/db/creatorStudio";
import { generateLlmText, type LlmGenerateTextInput, type LlmGenerateTextResult } from "@/lib/llm/client";

const ROUTER_PROVIDER_ORDER: CreatorProvider[] = ["anthropic", "openai", "gemini"];

interface CreatorRouterInput {
  userId: string;
  workflowId: string;
  callKind: string;
  route: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  modelModeOverride?: CreatorModelMode;
  preferredModel?: string;
}

async function sumSpendUsdSince(userId: string, since: Date): Promise<number> {
  const { data, error } = await db
    .from("llm_provider_calls")
    .select("estimated_cost_usd")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());
  if (error) throw new Error(`sumSpendUsdSince: ${error.message}`);
  let total = 0;
  for (const row of data ?? []) {
    const cost = Number((row as { estimated_cost_usd?: number | string | null }).estimated_cost_usd ?? 0);
    if (Number.isFinite(cost)) total += cost;
  }
  return Number(total.toFixed(6));
}

function modeFromSettings(input: { settingsMode: CreatorModelMode; override?: CreatorModelMode }): CreatorModelMode {
  if (!input.override) return input.settingsMode;
  if (input.override === "max" && input.settingsMode !== "max") return input.settingsMode;
  return input.override;
}

async function buildProviderApiKeys(userId: string): Promise<Partial<Record<CreatorProvider, string>>> {
  const entries = await Promise.all(
    ROUTER_PROVIDER_ORDER.map(async (provider) => {
      const key = await getCreatorProviderApiKey({ userId, provider });
      return [provider, key] as const;
    })
  );
  const out: Partial<Record<CreatorProvider, string>> = {};
  for (const [provider, key] of entries) {
    if (key) out[provider] = key;
  }
  return out;
}

async function enforceBudgets(userId: string, input: { perRequestCents: number; dailyCents: number; monthlyCents: number }) {
  const now = new Date();
  const dailyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [dailyUsd, monthlyUsd] = await Promise.all([
    sumSpendUsdSince(userId, dailyStart),
    sumSpendUsdSince(userId, monthStart),
  ]);
  if (input.dailyCents > 0 && dailyUsd * 100 >= input.dailyCents) {
    throw new Error("Daily LLM budget reached.");
  }
  if (input.monthlyCents > 0 && monthlyUsd * 100 >= input.monthlyCents) {
    throw new Error("Monthly LLM budget reached.");
  }
  if (input.perRequestCents > 0 && input.perRequestCents < 1) {
    throw new Error("Per-request budget is too low.");
  }
}

async function runWithRetries(input: LlmGenerateTextInput): Promise<LlmGenerateTextResult> {
  const maxRetries = 2;
  let attempt = 0;
  let lastError: unknown = null;
  while (attempt <= maxRetries) {
    try {
      return await generateLlmText({ ...input, retryCount: attempt });
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      const delayMs = Math.min(1_500, 250 * 2 ** attempt + Math.floor(Math.random() * 120));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt += 1;
    }
  }
  throw lastError ?? new Error("LLM routing failed.");
}

async function runManualOrAuto(input: {
  routerInput: CreatorRouterInput;
  mode: CreatorModelMode;
  defaultProvider: CreatorProvider | null;
  defaultModel: string | null;
  providerApiKeys: Partial<Record<CreatorProvider, string>>;
}) {
  const provider =
    input.mode === "manual"
      ? input.defaultProvider ?? ROUTER_PROVIDER_ORDER[0]
      : undefined;
  const model = input.routerInput.preferredModel?.trim() || input.defaultModel || undefined;
  return runWithRetries({
    callKind: input.routerInput.callKind,
    route: input.routerInput.route,
    workflowId: input.routerInput.workflowId,
    userId: input.routerInput.userId,
    provider,
    model,
    prompt: input.routerInput.prompt,
    systemPrompt: input.routerInput.systemPrompt,
    maxTokens: input.routerInput.maxTokens,
    temperature: input.routerInput.temperature,
    timeoutMs: 20_000,
    providerApiKeys: input.providerApiKeys,
  });
}

async function runMaxMode(input: {
  routerInput: CreatorRouterInput;
  providerApiKeys: Partial<Record<CreatorProvider, string>>;
}) {
  const candidates: LlmGenerateTextResult[] = [];
  for (const provider of ROUTER_PROVIDER_ORDER) {
    if (!input.providerApiKeys[provider]) continue;
    const candidate = await runWithRetries({
      provider,
      callKind: `${input.routerInput.callKind}_max_candidate`,
      route: input.routerInput.route,
      workflowId: input.routerInput.workflowId,
      userId: input.routerInput.userId,
      prompt: input.routerInput.prompt,
      systemPrompt: input.routerInput.systemPrompt,
      maxTokens: input.routerInput.maxTokens,
      temperature: 0.5,
      timeoutMs: 25_000,
      providerApiKeys: input.providerApiKeys,
      fallbackReason: "max_mode_debate",
    });
    candidates.push(candidate);
  }
  if (candidates.length === 0) throw new Error("No provider keys configured for max mode.");
  if (candidates.length === 1) return candidates[0]!;
  const mergedPrompt = [
    "You are a synthesis editor. Merge the strongest elements of the candidate responses.",
    "Return one concise response without mentioning models.",
    ...candidates.map((candidate, idx) => `Candidate ${idx + 1} (${candidate.provider}/${candidate.model}):\n${candidate.text}`),
  ].join("\n\n");
  return runWithRetries({
    callKind: `${input.routerInput.callKind}_max_synthesis`,
    route: input.routerInput.route,
    workflowId: input.routerInput.workflowId,
    userId: input.routerInput.userId,
    prompt: mergedPrompt,
    maxTokens: input.routerInput.maxTokens,
    temperature: 0.3,
    timeoutMs: 25_000,
    providerApiKeys: input.providerApiKeys,
    fallbackReason: "max_mode_synthesis",
  });
}

export async function generateCreatorText(input: CreatorRouterInput): Promise<LlmGenerateTextResult> {
  const settings = await getCreatorSettings(input.userId);
  const mode = modeFromSettings({
    settingsMode: settings.modelMode,
    override: input.modelModeOverride,
  });
  if (mode === "max" && !settings.maxModeEnabled) {
    throw new Error("Max mode is disabled in Creator Settings.");
  }
  await enforceBudgets(input.userId, {
    perRequestCents: settings.perRequestBudgetCents,
    dailyCents: settings.dailyBudgetCents,
    monthlyCents: settings.monthlyBudgetCents,
  });
  const providerApiKeys = await buildProviderApiKeys(input.userId);
  if (Object.keys(providerApiKeys).length === 0) {
    throw new Error("No provider API keys configured. Add keys in Creator Settings.");
  }
  if (mode === "max") {
    return runMaxMode({
      routerInput: input,
      providerApiKeys,
    });
  }
  return runManualOrAuto({
    routerInput: input,
    mode,
    defaultProvider: settings.defaultProvider,
    defaultModel: settings.defaultModel,
    providerApiKeys,
  });
}
