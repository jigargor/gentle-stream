import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateUserProfile,
  updateUserDisplay,
  UsernameCooldownError,
} from "@/lib/db/users";
import { getSessionUserId } from "@/lib/api/sessionUser";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await getOrCreateUserProfile(userId);
    return NextResponse.json(profile);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    displayName?: unknown;
    username?: unknown;
    avatarUrl?: unknown;
    weatherLocation?: unknown;
  };

  await getOrCreateUserProfile(userId);

  let displayName: string | null | undefined;
  let username: string | null | undefined;
  let avatarUrl: string | null | undefined;
  let weatherLocation: string | null | undefined;

  if (body.displayName !== undefined) {
    if (body.displayName === null) displayName = null;
    else if (typeof body.displayName === "string") {
      const t = body.displayName.trim();
      displayName = t.length ? t.slice(0, 80) : null;
    } else {
      return NextResponse.json({ error: "Invalid displayName" }, { status: 400 });
    }
  }

  if (body.username !== undefined) {
    if (body.username === null || body.username === "") username = null;
    else if (typeof body.username === "string") {
      const u = body.username.trim().toLowerCase();
      if (!USERNAME_RE.test(u)) {
        return NextResponse.json(
          {
            error:
              "Username must be 3–30 characters: lowercase letters, numbers, underscore",
          },
          { status: 400 }
        );
      }
      username = u;
    } else {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 });
    }
  }

  if (body.avatarUrl !== undefined) {
    if (body.avatarUrl === null || body.avatarUrl === "") avatarUrl = null;
    else if (typeof body.avatarUrl === "string") {
      const u = body.avatarUrl.trim();
      if (u.length > 2000) {
        return NextResponse.json({ error: "avatarUrl too long" }, { status: 400 });
      }
      avatarUrl = u;
    } else {
      return NextResponse.json({ error: "Invalid avatarUrl" }, { status: 400 });
    }
  }

  if (body.weatherLocation !== undefined) {
    if (body.weatherLocation === null || body.weatherLocation === "") weatherLocation = null;
    else if (typeof body.weatherLocation === "string") {
      const t = body.weatherLocation.trim();
      if (t.length > 120) {
        return NextResponse.json({ error: "weatherLocation too long" }, { status: 400 });
      }
      weatherLocation = t.length ? t : null;
    } else {
      return NextResponse.json({ error: "Invalid weatherLocation" }, { status: 400 });
    }
  }

  if (
    displayName === undefined &&
    username === undefined &&
    avatarUrl === undefined &&
    weatherLocation === undefined
  ) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const profile = await updateUserDisplay(userId, {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(weatherLocation !== undefined ? { weatherLocation } : {}),
    });
    return NextResponse.json(profile);
  } catch (e: unknown) {
    if (e instanceof UsernameCooldownError) {
      return NextResponse.json(
        {
          error: e.message,
          unlockAt: e.unlockAtIso,
        },
        { status: 429 }
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json({ error: "That username is taken" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
