import crypto from "crypto";

import { env } from "../config/env";

export interface EncryptedValue {
  iv: string;
  tag: string;
  value: string;
  version: 1;
}

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const secret = env.INTEGRATION_SECRET_KEY || env.JWT_SECRET;
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): EncryptedValue {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: encrypted.toString("base64"),
    version: 1,
  };
}

export function isEncryptedValue(value: unknown): value is EncryptedValue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.iv === "string" &&
    typeof candidate.tag === "string" &&
    typeof candidate.value === "string"
  );
}

export function decryptSecret(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (isEncryptedValue(parsed)) {
          return decryptSecret(parsed);
        }
      } catch {
        // Fall through to the plain string return below.
      }
    }
  }

  if (!isEncryptedValue(value)) {
    return typeof value === "string" ? value : null;
  }

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    Buffer.from(value.iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(value.tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(value.value, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
