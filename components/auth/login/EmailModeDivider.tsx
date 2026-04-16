import { loginSectionDividerStyle } from "./login-style-tokens";

export interface EmailModeDividerProps {
  isCreatorLogin: boolean;
}

export function EmailModeDivider({ isCreatorLogin }: EmailModeDividerProps) {
  if (isCreatorLogin) return null;
  return (
    <div style={loginSectionDividerStyle}>
      <span style={{ flex: 1, height: "1px", background: "#ddd" }} />
      or use email
      <span style={{ flex: 1, height: "1px", background: "#ddd" }} />
    </div>
  );
}
