export function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export interface CloudflareTurnstileApi {
  render: (
    container: HTMLElement | string,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      "timeout-callback"?: () => void;
    }
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

export function getTurnstileApi(): CloudflareTurnstileApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { turnstile?: CloudflareTurnstileApi }).turnstile;
}

export function resolveAuthRedirectBase(serverHint: string): string {
  if (typeof window !== "undefined") {
    const origin = window.location?.origin ?? "";
    if (origin) return origin.replace(/\/$/, "");
  }

  const trimmed = serverHint.trim().replace(/\/$/, "");
  if (trimmed) return trimmed;
  const fromEnv =
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim().replace(/\/$/, "") ??
    "";
  if (fromEnv) return fromEnv;
  return "";
}
