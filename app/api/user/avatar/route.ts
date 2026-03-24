/**
 * POST /api/user/avatar
 *
 * Saves a validated avatar URL to user_profiles.
 * Called after either:
 *   - Client uploads a file to Supabase Storage and gets back a public URL
 *   - User pastes an external image URL
 *
 * Body: { avatarUrl: string }
 *
 * The route reads the authenticated user from the session cookie
 * so the userId cannot be spoofed from the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { validateAvatarUrl } from "@/lib/avatar";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {}, // read-only in route handlers
      },
    }
  );

  // Verify the caller is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { avatarUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.avatarUrl !== "string") {
    return NextResponse.json({ error: "avatarUrl must be a string" }, { status: 400 });
  }

  // Validate the URL (light check — we trust Supabase Storage URLs implicitly)
  const isStorageUrl = body.avatarUrl.includes(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "__none__"
  );
  const validation = isStorageUrl
    ? { url: body.avatarUrl }           // Storage URLs are already trusted
    : validateAvatarUrl(body.avatarUrl); // External URLs get validated

  if ("error" in validation) {
    return NextResponse.json({ error: validation.error }, { status: 422 });
  }

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_url: validation.url })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[/api/user/avatar]", updateError);
    return NextResponse.json({ error: "Failed to save avatar" }, { status: 500 });
  }

  return NextResponse.json({ avatarUrl: validation.url });
}
