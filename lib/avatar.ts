/**
 * Avatar storage + validation helpers.
 *
 * Stored value is always `user_profiles.avatar_url` (single URL string).
 * Uploads go to Supabase Storage at `avatars/{userId}/avatar.{ext}` (server-side).
 */

export const AVATAR_BUCKET = "avatars";

/** Max upload size for API + UI hints */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const AVATAR_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AvatarMime = (typeof AVATAR_ALLOWED_MIME)[number];

/**
 * Curated preset URLs (e.g. CDN or `/public/avatars/*.svg`).
 * Empty until art exists — UI shows a “coming soon” state.
 */
export const HOUSE_AVATAR_URLS: string[] = [];

export function extFromAvatarMime(mime: string): string {
  const part = mime.split("/")[1] ?? "jpg";
  return part === "jpeg" ? "jpg" : part;
}

export function isAllowedAvatarMime(mime: string): mime is AvatarMime {
  return (AVATAR_ALLOWED_MIME as readonly string[]).includes(mime);
}

/**
 * Light validation for a pasted or preset image URL (external or Supabase public URL).
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

/**
 * If the URL points at **this** project's `avatars` bucket, require `userId/` prefix.
 * Other buckets or hosts are treated as external / presets — only URL shape is validated.
 */
export function avatarsBucketAccessForUser(
  publicUrl: string,
  projectUrl: string | undefined,
  userId: string
): "ok" | "foreign_user_file" | "not_this_bucket" {
  if (!projectUrl) return "not_this_bucket";
  let origin: string;
  try {
    origin = new URL(projectUrl).origin;
  } catch {
    return "not_this_bucket";
  }
  let u: URL;
  try {
    u = new URL(publicUrl);
  } catch {
    return "not_this_bucket";
  }
  if (u.origin !== origin) return "not_this_bucket";

  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const idx = u.pathname.indexOf(marker);
  if (idx === -1) return "not_this_bucket";

  const objectPath = u.pathname.slice(idx + marker.length);
  if (objectPath.startsWith(`${userId}/`)) return "ok";
  return "foreign_user_file";
}
