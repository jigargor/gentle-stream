import { db } from "@/lib/db/client";

export async function getUserSpotifyMoodScores(userId: string): Promise<Record<string, number>> {
  const { data, error } = await db
    .from("user_spotify_mood_feedback")
    .select("mood, score")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    const r = row as { mood: string; score: number };
    out[r.mood.trim().toLowerCase()] = r.score;
  }
  return out;
}

export async function applySpotifyMoodVote(input: {
  userId: string;
  mood: string;
  delta: number;
}): Promise<number> {
  const mood = input.mood.trim().toLowerCase();
  const { data: existing, error: readErr } = await db
    .from("user_spotify_mood_feedback")
    .select("score")
    .eq("user_id", input.userId)
    .eq("mood", mood)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  const prev = (existing as { score?: number } | null)?.score ?? 0;
  const next = Math.max(-20, Math.min(20, prev + input.delta));
  const { error: upsertErr } = await db.from("user_spotify_mood_feedback").upsert(
    {
      user_id: input.userId,
      mood,
      score: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,mood" }
  );
  if (upsertErr) throw new Error(upsertErr.message);
  return next;
}
