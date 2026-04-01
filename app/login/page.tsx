import { LoginForm } from "@/components/auth/LoginForm";
import { getAuthRedirectBaseFromRequest } from "@/lib/auth/redirect-origin";

/** Per-request auth redirect base (Host header); avoid static caching with a wrong origin. */
export const dynamic = "force-dynamic";

function firstParam(
  v: string | string[] | undefined
): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Reads `searchParams` on the server so the client bundle does not need
 * `useSearchParams` (avoids fragile Suspense/async chunks in Next dev on Windows).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const errorParam = firstParam(resolvedSearchParams.error) ?? null;
  const authRedirectBase = await getAuthRedirectBaseFromRequest();

  return (
    <LoginForm
      authRedirectBaseFromServer={authRedirectBase}
      initialNext={firstParam(resolvedSearchParams.next) ?? null}
      initialAuthError={errorParam}
      initialSessionExpired={
        firstParam(resolvedSearchParams.reason) === "session_expired"
      }
      initialOauthBrowserError={errorParam === "oauth_browser"}
    />
  );
}
