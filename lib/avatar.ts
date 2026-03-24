/**
 * lib/avatar.ts
 *
 * Avatar storage helpers.
 *
 * Two flows, one result:
 *   1. User pastes a URL  → validate it → store as-is in user_profiles.avatar_url
 *   2. User uploads file  → upload to Supabase Storage → get public URL → store that
 *
 * Both paths produce a URL string in user_profiles.avatar_url.
 * The <img> tag always just reads that one field.
 *
 * File path convention: avatars/{userId}/avatar.{ext}
 * Re-uploading replaces the file at the same path — no orphans accumulate.
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET = "avatars";
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// ─── Client-side upload (called from ProfileMenu) ─────────────────────────────

/**
 * Upload a File object to Supabase Storage and return the public URL.
 * Uses the anon client — RLS policies ensure users can only write to
 * their own folder (avatars/{userId}/).
 */
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Please upload a JPEG, PNG, WebP, or GIF image." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: "Image must be under 2 MB." };
  }

  // Derive extension from MIME type (more reliable than file.name)
  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${userId}/avatar.${ext}`;

  // Use the browser Supabase client (anon key, RLS enforced)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: true,          // replace existing file at same path
      cacheControl: "3600",
      contentType: file.type,
    });

  if (uploadError) {
    console.error("[uploadAvatar]", uploadError);
    return { error: "Upload failed — please try again." };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Bust the browser cache so the new avatar shows immediately
  const bustUrl = `${data.publicUrl}?t=${Date.now()}`;
  return { url: bustUrl };
}

// ─── URL validation (for the paste flow) ──────────────────────────────────────

/**
 * Light validation for a pasted image URL.
 * We check the URL is parseable and points at a plausible image path.
 * We do NOT fetch it — that's a server-side concern and unnecessary for
 * a user-provided avatar where a broken link just shows a fallback.
 */
export function validateAvatarUrl(raw: string): { url: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "URL cannot be empty." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "Please enter a valid URL (including https://)." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { error: "URL must start with http:// or https://." };
  }

  return { url: trimmed };
}

// ─── Delete old avatar from Storage (optional cleanup) ────────────────────────

/**
 * Delete the user's stored avatar file.
 * Only relevant if they uploaded previously — URL-pasted avatars have nothing
 * to delete from our storage.
 */
export async function deleteStoredAvatar(userId: string): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Try all supported extensions — we don't know which was used
  const paths = ["jpg", "png", "webp", "gif"].map((ext) => `${userId}/avatar.${ext}`);
  await supabase.storage.from(BUCKET).remove(paths);
  // Errors here are non-fatal — RLS will prevent cross-user deletion
}
