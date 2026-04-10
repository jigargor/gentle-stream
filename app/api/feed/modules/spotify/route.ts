import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { getUserSpotifyMoodScores } from "@/lib/db/spotifyMoodFeedback";
import { getSpotifyMoodTileData } from "@/lib/feed/modules/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category");
    const mood = request.nextUrl.searchParams.get("mood");
    const market = request.nextUrl.searchParams.get("market");
    let moodScores: Record<string, number> | null = null;
    const userId = await getSessionUserId();
    if (userId) {
      try {
        moodScores = await getUserSpotifyMoodScores(userId);
      } catch {
        moodScores = null;
      }
    }
    const data = await getSpotifyMoodTileData({
      category,
      mood,
      market,
      moodScores,
    });
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to resolve Spotify mood module.",
      },
      { status: 500 }
    );
  }
}
