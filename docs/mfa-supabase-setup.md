# Supabase MFA Setup Checklist

These project-level steps must be completed in the Supabase dashboard before in-app MFA enrollment will work.

## 1) Enable MFA factors

In `Supabase Dashboard -> Authentication -> Multi-factor`:

- Enable `App Authenticator (TOTP)`.
- Enable `Phone` MFA.

## 2) Configure phone delivery

Phone MFA challenge codes are delivered by your configured phone provider.

- Configure SMS/WhatsApp provider settings in Supabase Auth.
- Verify sender IDs / templates if your provider requires them.

## 3) Confirm auth templates and limits

Review:

- MFA-related email templates/wording.
- OTP TTL and rate-limit settings in Auth.

## 4) Verify from app

After deployment:

1. Enroll a TOTP factor from `Account settings`.
2. Enroll a phone factor from `Account settings`.
3. Sign out and sign back in.
4. Confirm the app prompts for MFA challenge before feed access.

