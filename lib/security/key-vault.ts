import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

const KEY_ALGORITHM = "aes-256-gcm";

export interface EncryptedProviderKeyPayload {
  keyCiphertext: string;
  keyIv: string;
  keyAuthTag: string;
  wrappedDek: string;
  dekWrapIv: string;
  dekWrapAuthTag: string;
  last4: string;
}

export interface EncryptedSensitiveTextPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function toBase64(value: Buffer): string {
  return value.toString("base64");
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

function getMasterKey(): Buffer {
  const env = getEnv();
  const raw = env.CREATOR_KEYS_MASTER_KEY?.trim() ?? "";
  if (raw.length > 0) return createHash("sha256").update(raw).digest();
  // Fallback for local/dev only so the app still runs without manual setup.
  return createHash("sha256")
    .update(`${env.SUPABASE_SERVICE_ROLE_KEY}:${env.NEXT_PUBLIC_SUPABASE_URL}`)
    .digest();
}

function encryptWithKey(key: Buffer, plaintext: Buffer): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(KEY_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

function decryptWithKey(input: {
  key: Buffer;
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}): Buffer {
  const decipher = createDecipheriv(KEY_ALGORITHM, input.key, input.iv);
  decipher.setAuthTag(input.authTag);
  return Buffer.concat([decipher.update(input.ciphertext), decipher.final()]);
}

export function encryptProviderKey(plainApiKey: string): EncryptedProviderKeyPayload {
  const normalized = plainApiKey.trim();
  if (normalized.length < 8) throw new Error("Provider key is too short.");

  const dek = randomBytes(32);
  const keyEncrypted = encryptWithKey(dek, Buffer.from(normalized, "utf8"));
  const wrappedDek = encryptWithKey(getMasterKey(), dek);
  return {
    keyCiphertext: toBase64(keyEncrypted.ciphertext),
    keyIv: toBase64(keyEncrypted.iv),
    keyAuthTag: toBase64(keyEncrypted.authTag),
    wrappedDek: toBase64(wrappedDek.ciphertext),
    dekWrapIv: toBase64(wrappedDek.iv),
    dekWrapAuthTag: toBase64(wrappedDek.authTag),
    last4: normalized.slice(-4),
  };
}

export function decryptProviderKey(input: {
  keyCiphertext: string;
  keyIv: string;
  keyAuthTag: string;
  wrappedDek: string;
  dekWrapIv: string;
  dekWrapAuthTag: string;
}): string {
  const dek = decryptWithKey({
    key: getMasterKey(),
    ciphertext: fromBase64(input.wrappedDek),
    iv: fromBase64(input.dekWrapIv),
    authTag: fromBase64(input.dekWrapAuthTag),
  });
  const plaintext = decryptWithKey({
    key: dek,
    ciphertext: fromBase64(input.keyCiphertext),
    iv: fromBase64(input.keyIv),
    authTag: fromBase64(input.keyAuthTag),
  });
  return plaintext.toString("utf8");
}

export function encryptSensitiveText(plainText: string): EncryptedSensitiveTextPayload {
  const normalized = plainText.trim();
  const encrypted = encryptWithKey(getMasterKey(), Buffer.from(normalized, "utf8"));
  return {
    ciphertext: toBase64(encrypted.ciphertext),
    iv: toBase64(encrypted.iv),
    authTag: toBase64(encrypted.authTag),
  };
}

export function decryptSensitiveText(input: EncryptedSensitiveTextPayload): string {
  const plaintext = decryptWithKey({
    key: getMasterKey(),
    ciphertext: fromBase64(input.ciphertext),
    iv: fromBase64(input.iv),
    authTag: fromBase64(input.authTag),
  });
  return plaintext.toString("utf8");
}
