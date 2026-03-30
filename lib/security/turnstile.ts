interface TurnstileVerifyOptions {
  token: string;
  remoteIp?: string | null;
}

interface TurnstileVerifySuccess {
  success: true;
}

interface TurnstileVerifyFailure {
  success: false;
  error: string;
}

type TurnstileVerifyResult = TurnstileVerifySuccess | TurnstileVerifyFailure;

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
}

export function isTurnstileEnabled(): boolean {
  return (
    process.env.TURNSTILE_ENABLED === "1" ||
    process.env.TURNSTILE_ENABLED === "true"
  );
}

export async function verifyTurnstileToken(
  options: TurnstileVerifyOptions
): Promise<TurnstileVerifyResult> {
  if (!isTurnstileEnabled()) return { success: true };

  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return { success: false, error: "Captcha is misconfigured." };
  }

  const token = options.token.trim();
  if (!token) return { success: false, error: "Captcha is required." };

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (options.remoteIp?.trim()) body.set("remoteip", options.remoteIp.trim());

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }
    );

    if (!response.ok) {
      return { success: false, error: "Captcha verification failed." };
    }

    const parsed = (await response.json()) as TurnstileResponse;
    if (!parsed.success) {
      return {
        success: false,
        error: "Captcha verification failed.",
      };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Captcha verification failed." };
  }
}
