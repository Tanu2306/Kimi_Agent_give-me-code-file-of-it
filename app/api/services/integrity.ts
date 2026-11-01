import { createHmac } from "node:crypto";
import { env } from "../lib/env";

const secret = () => process.env.MANDATE_HASH_SECRET || env.appSecret || "intentlock-dev-secret";

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

export function signCanonicalPayload(payload: Record<string, unknown>) {
  return createHmac("sha256", secret()).update(canonicalize(payload)).digest("hex");
}

export function verifyCanonicalPayload(payload: Record<string, unknown>, expectedHash: string) {
  return signCanonicalPayload(payload) === expectedHash;
}
