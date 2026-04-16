import { emailVerificationMessage } from "./login-copy";
import { loginSecondaryButtonStyle } from "./login-style-tokens";

export interface EmailVerificationPanelProps {
  onBackToSignIn: () => void;
}

export function EmailVerificationPanel({ onBackToSignIn }: EmailVerificationPanelProps) {
  return (
    <div style={{ display: "grid", gap: "0.8rem" }}>
      <p
        style={{
          fontFamily: "'IM Fell English', Georgia, serif",
          fontSize: "0.88rem",
          color: "#1a472a",
          textAlign: "center",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {emailVerificationMessage}
      </p>
      <button
        type="button"
        onClick={onBackToSignIn}
        style={loginSecondaryButtonStyle}
      >
        Back to sign in
      </button>
    </div>
  );
}
