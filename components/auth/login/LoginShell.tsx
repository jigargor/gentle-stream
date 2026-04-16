import type { ReactNode } from "react";
import { AppLogo } from "@/components/brand/AppLogo";
import {
  loginCardStyle,
  loginLogoWrapStyle,
  loginShellStyle,
  loginSubtitleStyle,
  loginTitleStyle,
} from "./login-style-tokens";
import { creatorSubtitle, subscriberSubtitle } from "./login-copy";

export interface LoginShellProps {
  isCreatorLogin: boolean;
  children: ReactNode;
}

export function LoginShell({ isCreatorLogin, children }: LoginShellProps) {
  return (
    <div style={loginShellStyle}>
      <div style={loginCardStyle}>
        <div style={loginLogoWrapStyle}>
          <AppLogo heightPx={40} priority />
        </div>
        <h1 style={loginTitleStyle}>{isCreatorLogin ? "Creator login" : "Gentle Stream"}</h1>
        <p style={loginSubtitleStyle}>{isCreatorLogin ? creatorSubtitle : subscriberSubtitle}</p>
        {children}
      </div>
    </div>
  );
}
