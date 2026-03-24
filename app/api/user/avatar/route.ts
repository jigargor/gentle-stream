import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { getOrCreateUserProfile, updateUserDisplay } from "@/lib/db/users";
import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  avatarsBucketAccessForUser,
  extFromAvatarMime,
  isAllowedAvatarMime,
  validateAvatarUrl,
} from "@/lib/avatar";

function storagePathsForUser(userId: string): string[] {
  return ["jpg", "png", "webp", "gif"].map((ext) => `${userId}/avatar.${ext}`);
}

/**
 * POST JSON `{ avatarUrl }` — save external URL, preset URL, or public Storage URL.
 * POST multipart `file` — upload to Storage (service role), then save public URL.
 */
export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await getOrCreateUserProfile(userId);

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (!isAllowedAvatarMime(file.type)) {
      return NextResponse.json(
        { error: "Use a JPEG, PNG, WebP, or GIF image." },
        { status: 400 }
      );
    }

    if (file.size > AVATAR_MAX_BYTES) {
      return NextResponse.json(
        { error: `Image must be under ${Math.floor(AVATAR_MAX_BYTES / (1024 * 1024))} MB.` },
        { status: 400 }
      );
    }

    const ext = extFromAvatarMime(file.type);
    const path = `${userId}/avatar.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await db.storage.from(AVATAR_BUCKET).upload(path, buffer, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

    if (uploadError) {
      console.error("[POST /api/user/avatar upload]", uploadError);
      const hint =
        uploadError.message?.toLowerCase().includes("bucket") ||
        uploadError.message?.toLowerCase().includes("not found")
          ? ' Create a public bucket named "avatars" in Supabase Storage.'
          : "";
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}.${hint}` },
        { status: 500 }
      );
    }

    const { data: pub } = db.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    try {
      const profile = await updateUserDisplay(userId, { avatarUrl: publicUrl });
      return NextResponse.json({
        avatarUrl: publicUrl,
        bustUrl: `${publicUrl}?t=${Date.now()}`,
        profile,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json(
        {
          error: message,
          hint:
            message.includes("avatar_url") || message.includes("schema cache")
              ? "Run SQL migration 005 (or 006) in Supabase so user_profiles.avatar_url exists."
              : undefined,
        },
        { status: 500 }
      );
    }
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

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const validation = validateAvatarUrl(body.avatarUrl);
  if ("error" in validation) {
    return NextResponse.json({ error: validation.error }, { status: 422 });
  }

  const access = avatarsBucketAccessForUser(validation.url, projectUrl, userId);
  if (access === "foreign_user_file") {
    return NextResponse.json(
      { error: "That file is in another account’s avatar folder." },
      { status: 403 }
    );
  }

  try {
    const profile = await updateUserDisplay(userId, { avatarUrl: validation.url });
    return NextResponse.json({
      avatarUrl: validation.url,
      bustUrl: `${validation.url}?t=${Date.now()}`,
      profile,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        error: message,
        hint:
          message.includes("avatar_url") || message.includes("schema cache")
            ? "Run SQL migration 005 (or 006) in Supabase so user_profiles.avatar_url exists."
            : undefined,
      },
      { status: 500 }
    );
  }
}

/** Clear avatar in DB and remove uploaded files from Storage (best effort). */
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await getOrCreateUserProfile(userId);

  const paths = storagePathsForUser(userId);
  const { error: removeError } = await db.storage.from(AVATAR_BUCKET).remove(paths);
  if (removeError) {
    console.warn("[DELETE /api/user/avatar storage]", removeError.message);
  }

  try {
    const profile = await updateUserDisplay(userId, { avatarUrl: null });
    return NextResponse.json({ profile });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
