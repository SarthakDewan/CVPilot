import { createHash, randomBytes } from "node:crypto";

/** 256 bits of randomness, URL-safe. Only the hash is persisted. */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
