const SECRET_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9_\-]{8,}/g,
  /AIza[0-9A-Za-z\-_]{20,}/g,
  /Bearer\s+[A-Za-z0-9\-_\.=]+/g,
];

export function redactSecrets(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_KEY_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED_SECRET]");
  }
  return redacted;
}

export function safeErrorMessage(error: unknown, fallback = "Request failed."): string {
  if (!(error instanceof Error)) return fallback;
  const trimmed = error.message.trim();
  if (!trimmed) return fallback;
  return redactSecrets(trimmed).slice(0, 600);
}
