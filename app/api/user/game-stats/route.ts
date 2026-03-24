import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import type { UserGameStats } from "@/lib/types";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [countRes, aggRes, recentRes] = await Promise.all([
    db
      .from("game_completions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
    db
      .from("game_completions")
      .select("game_type, duration_seconds")
      .eq("user_id", userId),
    db
      .from("game_completions")
      .select("game_type, difficulty, duration_seconds, completed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(8),
  ]);

  if (countRes.error) {
    return NextResponse.json({ error: countRes.error.message }, { status: 500 });
  }
  if (aggRes.error) {
    return NextResponse.json({ error: aggRes.error.message }, { status: 500 });
  }
  if (recentRes.error) {
    return NextResponse.json({ error: recentRes.error.message }, { status: 500 });
  }

  const list = aggRes.data ?? [];
  const byType: UserGameStats["byType"] = {};
  let totalSeconds = 0;

  for (const r of list) {
    const gt = r.game_type as string;
    const ds = r.duration_seconds as number;
    totalSeconds += ds;
    if (!byType[gt]) {
      byType[gt] = { completions: 0, totalSeconds: 0, avgSeconds: 0 };
    }
    const b = byType[gt]!;
    b.completions += 1;
    b.totalSeconds += ds;
  }

  for (const k of Object.keys(byType)) {
    const b = byType[k]!;
    b.avgSeconds =
      b.completions > 0 ? Math.round(b.totalSeconds / b.completions) : 0;
  }

  const recentRows = recentRes.data ?? [];
  const recent = recentRows.map((r) => ({
    gameType: r.game_type as string,
    difficulty: r.difficulty as string,
    durationSeconds: r.duration_seconds as number,
    completedAt: r.completed_at as string,
  }));

  const stats: UserGameStats = {
    totalCompletions: countRes.count ?? list.length,
    totalSecondsPlayed: totalSeconds,
    byType,
    recent,
  };

  return NextResponse.json(stats);
}
