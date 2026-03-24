import { LoginForm } from "@/components/auth/LoginForm";
import { getAuthRedirectOriginServer } from "@/lib/auth/redirect-origin";

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
export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const errorParam = firstParam(searchParams.error) ?? null;
  const authRedirectBase = getAuthRedirectOriginServer();

  return (
    <LoginForm
      authRedirectBaseFromServer={authRedirectBase}
      initialNext={firstParam(searchParams.next) ?? null}
      initialAuthError={errorParam}
      initialSessionExpired={
        firstParam(searchParams.reason) === "session_expired"
      }
      initialMagicLinkBrowserError={errorParam === "magic_link_browser"}
    />
  );
}
