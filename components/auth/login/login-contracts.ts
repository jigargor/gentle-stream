export interface EmailPasswordAuthRequest {
  email: string;
  password: string;
  mode: "sign_in" | "sign_up";
  audience: "subscriber" | "creator";
  birthDate: string;
  redirectTo: string;
  turnstileToken: string;
}

export interface EmailPasswordAuthResponse {
  requiresEmailVerification?: boolean;
}

export interface GuestAccessRequest {
  turnstileToken: string;
}

export interface ApiErrorResponse {
  error?: string;
}
