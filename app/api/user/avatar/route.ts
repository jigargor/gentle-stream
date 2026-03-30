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
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

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
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  await getOrCreateUserProfile(userId);

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.INVALID_JSON,
        message: "Invalid form data",
      });
    }

    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.MISSING_FIELD,
        message: "Missing file",
      });
    }

    if (!isAllowedAvatarMime(file.type)) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Use a JPEG, PNG, WebP, or GIF image.",
      });
    }

    if (file.size > AVATAR_MAX_BYTES) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: `Image must be under ${Math.floor(AVATAR_MAX_BYTES / (1024 * 1024))} MB.`,
      });
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
      return apiErrorResponse({
        request,
        status: 500,
        code: API_ERROR_CODES.INTERNAL,
        message: `Upload failed: ${uploadError.message}.${hint}`,
      });
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
      return apiErrorResponse({
        request,
        status: 500,
        code: API_ERROR_CODES.INTERNAL,
        message,
        details:
          message.includes("avatar_url") || message.includes("schema cache")
            ? {
                hint: "Run SQL migration 005 (or 006) in Supabase so user_profiles.avatar_url exists.",
              }
            : undefined,
      });
    }
  }

  let body: { avatarUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_JSON,
      message: "Invalid JSON body",
    });
  }

  if (typeof body.avatarUrl !== "string") {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "avatarUrl must be a string",
    });
  }

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const validation = validateAvatarUrl(body.avatarUrl);
  if ("error" in validation) {
    return apiErrorResponse({
      request,
      status: 422,
      code: API_ERROR_CODES.VALIDATION,
      message: validation.error,
    });
  }

  const access = avatarsBucketAccessForUser(validation.url, projectUrl, userId);
  if (access === "foreign_user_file") {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN,
      message: "That file is in another account’s avatar folder.",
    });
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
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
      details:
        message.includes("avatar_url") || message.includes("schema cache")
          ? {
              hint: "Run SQL migration 005 (or 006) in Supabase so user_profiles.avatar_url exists.",
            }
          : undefined,
    });
  }
}

/** Clear avatar in DB and remove uploaded files from Storage (best effort). */
export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
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
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
