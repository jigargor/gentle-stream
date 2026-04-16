import { loginFooterLinksStyle, LOGIN_TEXT_MUTED } from "./login-style-tokens";

export function LoginFooterLinks() {
  return (
    <p style={loginFooterLinksStyle}>
      <a href="/about" style={{ color: LOGIN_TEXT_MUTED, textDecoration: "underline" }}>
        About
      </a>
      {" | "}
      <a href="/privacy" style={{ color: LOGIN_TEXT_MUTED, textDecoration: "underline" }}>
        Privacy
      </a>
      {" | "}
      <a href="/terms" style={{ color: LOGIN_TEXT_MUTED, textDecoration: "underline" }}>
        Terms
      </a>
      {" | "}
      <a href="/data-deletion" style={{ color: LOGIN_TEXT_MUTED, textDecoration: "underline" }}>
        Data deletion
      </a>
    </p>
  );
}
