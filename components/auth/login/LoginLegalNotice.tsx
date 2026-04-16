import { loginLegalNoticeStyle } from "./login-style-tokens";

export function LoginLegalNotice() {
  return (
    <p style={loginLegalNoticeStyle}>
      By creating an account, you will review and accept our{" "}
      <a href="/terms" style={{ color: "#5c4a32" }}>
        Terms of service
      </a>{" "}
      and{" "}
      <a href="/privacy" style={{ color: "#5c4a32" }}>
        Privacy policy
      </a>{" "}
      after signup.
    </p>
  );
}
