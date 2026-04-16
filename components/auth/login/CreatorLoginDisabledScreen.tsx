import { AppLogo } from "@/components/brand/AppLogo";
import { creatorDisabledMessage } from "./login-copy";
import {
  loginBodyTextStyle,
  loginCardStyle,
  loginLogoWrapStyle,
  loginShellStyle,
  loginTitleStyle,
  loginUnderlinedLinkStyle,
} from "./login-style-tokens";

export function CreatorLoginDisabledScreen() {
  return (
    <div style={loginShellStyle}>
      <div style={loginCardStyle}>
        <div style={loginLogoWrapStyle}>
          <AppLogo heightPx={40} priority />
        </div>
        <h1 style={loginTitleStyle}>Creator login</h1>
        <p
          style={{
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            fontSize: "0.92rem",
            color: "#8b4513",
            textAlign: "center",
            margin: "0 0 1.1rem",
            lineHeight: 1.5,
          }}
        >
          {creatorDisabledMessage}
        </p>
        <p
          style={{
            ...loginBodyTextStyle,
            margin: 0,
            textAlign: "center",
            fontSize: "0.82rem",
          }}
        >
          You can continue using subscriber login from{" "}
          <a href="/login" style={{ color: "#1a472a", ...loginUnderlinedLinkStyle }}>
            the main sign-in page
          </a>
          .
        </p>
      </div>
    </div>
  );
}
