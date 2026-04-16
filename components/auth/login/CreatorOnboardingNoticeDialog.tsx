import { creatorNoticeMessage } from "./login-copy";
import {
  loginDialogCardStyle,
  loginDialogOverlayStyle,
  loginDialogTitleStyle,
  loginPrimaryButtonStyle,
} from "./login-style-tokens";

export interface CreatorOnboardingNoticeDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatorOnboardingNoticeDialog({
  isOpen,
  onClose,
}: CreatorOnboardingNoticeDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={loginDialogOverlayStyle}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-onboarding-notice-title"
        onClick={(event) => event.stopPropagation()}
        style={loginDialogCardStyle}
      >
        <h2 id="creator-onboarding-notice-title" style={loginDialogTitleStyle}>
          Log in first
        </h2>
        <p
          style={{
            margin: "0.7rem 0 0",
            color: "#555",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.92rem",
            lineHeight: 1.5,
          }}
        >
          {creatorNoticeMessage}
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{ ...loginPrimaryButtonStyle, marginTop: "1rem" }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
