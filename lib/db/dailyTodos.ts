import { db } from "@/lib/db/client";

interface DailyTodoRow {
  id: string;
  user_id: string;
  local_day: string;
  timezone: string;
  label: string;
  done: boolean;
  sort_order: number;
}

export interface DailyTodoItem {
  id: string;
  label: string;
  done: boolean;
  sortOrder: number;
}

function todayForTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export async function getOrCreateDailyTodos(userId: string, timezone: string): Promise<{
  localDay: string;
  timezone: string;
  items: DailyTodoItem[];
}> {
  const localDay = todayForTimezone(timezone);
  const { data, error } = await db
    .from("user_daily_todos")
    .select("id,user_id,local_day,timezone,label,done,sort_order")
    .eq("user_id", userId)
    .eq("local_day", localDay)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`getOrCreateDailyTodos: ${error.message}`);

  const rows = (data ?? []) as DailyTodoRow[];
  if (rows.length > 0) {
    return {
      localDay,
      timezone,
      items: rows.map((row) => ({
        id: row.id,
        label: row.label,
        done: row.done,
        sortOrder: row.sort_order,
      })),
    };
  }

  const defaults = [
    "Top priority for today",
    "One healthy break",
    "One gratitude moment",
  ];
  const { data: inserted, error: insertError } = await db
    .from("user_daily_todos")
    .insert(
      defaults.map((label, idx) => ({
        user_id: userId,
        local_day: localDay,
        timezone,
        label,
        done: false,
        sort_order: idx,
      }))
    )
    .select("id,user_id,local_day,timezone,label,done,sort_order")
    .order("sort_order", { ascending: true });
  if (insertError) throw new Error(`getOrCreateDailyTodos insert: ${insertError.message}`);

  const nextRows = (inserted ?? []) as DailyTodoRow[];
  return {
    localDay,
    timezone,
    items: nextRows.map((row) => ({
      id: row.id,
      label: row.label,
      done: row.done,
      sortOrder: row.sort_order,
    })),
  };
}

export async function updateDailyTodoItem(input: {
  userId: string;
  todoId: string;
  done?: boolean;
  label?: string;
}): Promise<void> {
  const updates: { done?: boolean; label?: string } = {};
  if (input.done !== undefined) updates.done = input.done;
  if (input.label !== undefined) updates.label = input.label.trim().slice(0, 140);
  const { error } = await db
    .from("user_daily_todos")
    .update(updates)
    .eq("id", input.todoId)
    .eq("user_id", input.userId);
  if (error) throw new Error(`updateDailyTodoItem: ${error.message}`);
}

export async function addDailyTodoItem(input: {
  userId: string;
  timezone: string;
  label: string;
}): Promise<void> {
  const localDay = todayForTimezone(input.timezone);
  const { data, error } = await db
    .from("user_daily_todos")
    .select("sort_order")
    .eq("user_id", input.userId)
    .eq("local_day", localDay)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) throw new Error(`addDailyTodoItem list: ${error.message}`);
  const sortOrder = ((data?.[0] as { sort_order?: number } | undefined)?.sort_order ?? -1) + 1;

  const { error: insertError } = await db.from("user_daily_todos").insert({
    user_id: input.userId,
    local_day: localDay,
    timezone: input.timezone,
    label: input.label.trim().slice(0, 140),
    done: false,
    sort_order: sortOrder,
  });
  if (insertError) throw new Error(`addDailyTodoItem insert: ${insertError.message}`);
}
