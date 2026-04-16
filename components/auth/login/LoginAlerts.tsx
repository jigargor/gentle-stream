import {
  genericAuthErrorMessage,
  oauthBrowserErrorMessage,
  sessionExpiredMessage,
  ssoConflictMessage,
} from "./login-copy";
import { loginWarningTextStyle } from "./login-style-tokens";

export interface LoginAlertsProps {
  initialSessionExpired: boolean;
  initialOauthBrowserError: boolean;
  authError: string | null;
}

export function LoginAlerts({
  initialSessionExpired,
  initialOauthBrowserError,
  authError,
}: LoginAlertsProps) {
  return (
    <>
      {initialSessionExpired ? (
        <p style={loginWarningTextStyle}>
          {sessionExpiredMessage}
        </p>
      ) : null}

      {initialOauthBrowserError ? (
        <p
          style={{
            ...loginWarningTextStyle,
            lineHeight: 1.5,
          }}
        >
          {oauthBrowserErrorMessage}
        </p>
      ) : null}

      {authError && !initialOauthBrowserError ? (
        <p style={loginWarningTextStyle}>
          {authError === "sso_email_conflict" ? ssoConflictMessage : genericAuthErrorMessage}
        </p>
      ) : null}
    </>
  );
}