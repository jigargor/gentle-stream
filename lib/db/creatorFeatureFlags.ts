import { db } from "@/lib/db/client";

interface CreatorFeatureFlagRow {
  id: string;
  flag_key: string;
  scope_type: "global" | "cohort" | "user";
  scope_value: string | null;
  is_enabled: boolean;
}

export async function listEffectiveCreatorFeatureFlags(input: {
  userId: string;
  cohorts?: string[];
}): Promise<Record<string, boolean>> {
  const cohorts = (input.cohorts ?? []).filter(Boolean);
  const { data, error } = await db.from("creator_feature_flags").select("*");
  if (error) throw new Error(`listEffectiveCreatorFeatureFlags: ${error.message}`);
  const rows = (data ?? []) as CreatorFeatureFlagRow[];
  const flags = new Map<string, { value: boolean; priority: number }>();
  for (const row of rows) {
    let applies = false;
    let priority = 0;
    if (row.scope_type === "global") {
      applies = true;
      priority = 0;
    } else if (row.scope_type === "cohort" && row.scope_value && cohorts.includes(row.scope_value)) {
      applies = true;
      priority = 1;
    } else if (row.scope_type === "user" && row.scope_value === input.userId) {
      applies = true;
      priority = 2;
    }
    if (!applies) continue;
    const current = flags.get(row.flag_key);
    if (!current || priority >= current.priority) {
      flags.set(row.flag_key, { value: row.is_enabled === true, priority });
    }
  }
  return Object.fromEntries(
    Array.from(flags.entries()).map(([key, value]) => [key, value.value])
  );
}

export async function upsertUserCreatorFeatureFlag(input: {
  userId: string;
  flagKey: string;
  enabled: boolean;
}): Promise<void> {
  const { error } = await db.from("creator_feature_flags").upsert(
    {
      flag_key: input.flagKey,
      scope_type: "user",
      scope_value: input.userId,
      is_enabled: input.enabled === true,
    },
    { onConflict: "flag_key,scope_type,scope_value" }
  );
  if (error) throw new Error(`upsertUserCreatorFeatureFlag: ${error.message}`);
}
