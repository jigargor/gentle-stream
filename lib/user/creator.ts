import type { UserProfile } from "@/lib/types";

export function isCreator(profile: Pick<UserProfile, "userRole">): boolean {
  return profile.userRole === "creator";
}

/**
 * Infrastructure for a second user class (“creators”) who will publish their own
 * stories (Substack-style). Today all signups are `general`; promote a user by
 * setting `user_profiles.user_role = 'creator'` in Supabase SQL or a future admin API.
 *
 * Suggested follow-ups when you build publishing:
 * - `creator_publications` (or `posts`): id, creator_user_id, slug, title, body,
 *   published_at, created_at; UNIQUE(creator_user_id, slug)
 * - RLS so only the owning creator can write; public SELECT for published rows
 * - Routes: `/create` (dashboard + editor), `/p/[handle]/[slug]` (reader view)
 * - Optional `creator_profiles`: display_name, bio, avatar_url, stripe_account_id, …
 */
