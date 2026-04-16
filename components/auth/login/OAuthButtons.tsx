import type { Provider } from "@supabase/supabase-js";

export interface OAuthButtonsProps {
  isCreatorLogin: boolean;
  oauthBusy: boolean;
  oauthProvider: Provider | null;
  onSignInWithOAuth: (provider: Provider) => void;
}

export function OAuthButtons({
  isCreatorLogin,
  oauthBusy,
  oauthProvider,
  onSignInWithOAuth,
}: OAuthButtonsProps) {
  return (
    <>
      <button
        type="button"
        disabled={oauthBusy || isCreatorLogin}
        onClick={() => onSignInWithOAuth("google")}
        style={{
          width: "100%",
          padding: "0.65rem 1rem",
          border: "1px solid #1a1a1a",
          background: "#fff",
          color: "#1a1a1a",
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.8rem",
          letterSpacing: "0.04em",
          cursor: oauthBusy ? "wait" : "pointer",
          opacity: 1,
          marginBottom: "0.6rem",
          display: isCreatorLogin ? "none" : "block",
        }}
      >
        {oauthBusy && oauthProvider === "google" ? "Redirecting..." : "Continue with Google"}
      </button>

      <button
        type="button"
        disabled={oauthBusy || isCreatorLogin}
        onClick={() => onSignInWithOAuth("facebook")}
        style={{
          width: "100%",
          padding: "0.65rem 1rem",
          border: "1px solid #1a1a1a",
          background: "#fff",
          color: "#1a1a1a",
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.8rem",
          letterSpacing: "0.04em",
          cursor: oauthBusy ? "wait" : "pointer",
          opacity: 1,
          marginBottom: "1.25rem",
          display: isCreatorLogin ? "none" : "block",
        }}
      >
        {oauthBusy && oauthProvider === "facebook" ? "Redirecting..." : "Continue with Facebook"}
      </button>
    </>
  );
}
