import type { CSSProperties } from "react";

export const LOGIN_TEXT_MUTED = "#454545";

export const loginShellStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#ede9e1",
  padding: "1.5rem",
};

export const loginCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "400px",
  background: "#faf8f3",
  borderTop: "3px double #1a1a1a",
  borderBottom: "2px solid #1a1a1a",
  boxShadow: "0 0 40px rgba(0,0,0,0.08)",
  padding: "2rem 1.75rem",
};

export const loginLogoWrapStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  marginBottom: "0.35rem",
};

export const loginTitleStyle: CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: "1.65rem",
  fontWeight: 700,
  margin: "0 0 0.35rem",
  color: "#0d0d0d",
  textAlign: "center",
};

export const loginSubtitleStyle: CSSProperties = {
  fontFamily: "'IM Fell English', Georgia, serif",
  fontStyle: "italic",
  fontSize: "0.88rem",
  color: "#666",
  textAlign: "center",
  margin: "0 0 1.75rem",
  lineHeight: 1.45,
};

export const loginSectionDividerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  margin: "0 0 1.25rem",
  color: LOGIN_TEXT_MUTED,
  fontSize: "0.7rem",
  fontFamily: "'IM Fell English', Georgia, serif",
};

export const loginFooterLinksStyle: CSSProperties = {
  margin: "1.35rem 0 0",
  textAlign: "center",
  fontFamily: "'IM Fell English', Georgia, serif",
  fontSize: "0.72rem",
  color: LOGIN_TEXT_MUTED,
};

export const loginUnderlinedLinkStyle: CSSProperties = {
  textDecoration: "underline",
};

export const loginWarningTextStyle: CSSProperties = {
  fontFamily: "'IM Fell English', Georgia, serif",
  fontSize: "0.82rem",
  color: "#8b4513",
  margin: "0 0 1rem",
  textAlign: "center",
};

export const loginBodyTextStyle: CSSProperties = {
  fontFamily: "'IM Fell English', Georgia, serif",
  color: "#555",
  lineHeight: 1.5,
};

export const loginLegalNoticeStyle: CSSProperties = {
  ...loginBodyTextStyle,
  margin: "0 0 1rem",
  fontSize: "0.78rem",
};

export const loginDialogOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 60,
};

export const loginDialogCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "420px",
  background: "#faf8f3",
  borderTop: "3px double #1a1a1a",
  borderBottom: "2px solid #1a1a1a",
  boxShadow: "0 18px 45px rgba(0,0,0,0.2)",
  padding: "1.35rem 1.25rem",
};

export const loginDialogTitleStyle: CSSProperties = {
  margin: 0,
  color: "#1a1a1a",
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: "1.1rem",
};

export const loginPrimaryButtonStyle: CSSProperties = {
  width: "100%",
  padding: "0.58rem 1rem",
  border: "none",
  background: "#1a1a1a",
  color: "#faf8f3",
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: "0.78rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const loginSecondaryButtonStyle: CSSProperties = {
  width: "100%",
  padding: "0.56rem 1rem",
  border: "1px solid #1a1a1a",
  background: "#fff",
  color: "#1a1a1a",
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: "0.75rem",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const loginFieldLabelStyle: CSSProperties = {
  display: "block",
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: "0.72rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: LOGIN_TEXT_MUTED,
  marginBottom: "0.35rem",
};

export const loginFieldInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.55rem 0.65rem",
  border: "1px solid #ccc",
  background: "#fff",
  fontFamily: "Georgia, serif",
  fontSize: "0.95rem",
};

export const loginMutedHintStyle: CSSProperties = {
  fontFamily: "'IM Fell English', Georgia, serif",
  fontSize: "0.72rem",
  color: LOGIN_TEXT_MUTED,
  lineHeight: 1.45,
};

export const loginIconButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#666",
  cursor: "pointer",
  padding: "0.2rem",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export function getEmailModeButtonStyle(isActive: boolean, isBusy: boolean): CSSProperties {
  return {
    flex: 1,
    border: "1px solid #1a1a1a",
    padding: "0.45rem 0.55rem",
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: "0.74rem",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    cursor: isBusy ? "wait" : "pointer",
    background: isActive ? "#1a1a1a" : "#fff",
    color: isActive ? "#faf8f3" : "#1a1a1a",
  };
}
