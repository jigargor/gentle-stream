import { LoginForm } from "@/components/auth/LoginForm";
import { getAuthRedirectBaseFromRequest } from "@/lib/auth/redirect-origin";

export const dynamic = "force-dynamic";

function firstParam(
  v: string | string[] | undefined
): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default async function CreatorLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const errorParam = firstParam(resolvedSearchParams.error) ?? null;
  const authRedirectBase = await getAuthRedirectBaseFromRequest();

  return (
    <LoginForm
      audience="creator"
      authRedirectBaseFromServer={authRedirectBase}
      initialNext={firstParam(resolvedSearchParams.next) ?? "/creator"}
      initialAuthError={errorParam}
      initialSessionExpired={
        firstParam(resolvedSearchParams.reason) === "session_expired"
      }
      initialOauthBrowserError={errorParam === "oauth_browser"}
    />
  );
}
