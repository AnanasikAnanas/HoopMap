import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const passwordRecoveryCookies = {
  verifier: "hoopmap_recovery_pkce_verifier",
  proof: "hoopmap_recovery_proof",
} as const;

const PROOF_LIFETIME_SECONDS = 15 * 60;

function secret(): string {
  const value =
    process.env.RATE_LIMIT_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("Password recovery secret is not configured");
  }
  return value || "development-only-password-recovery";
}

function signature(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function isValidRecoveryPkceVerifier(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

export function passwordRecoveryCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60,
  };
}

export function passwordRecoveryUrl(request: NextRequest): string {
  const configured =
    process.env.SITE_URL?.trim() || process.env.TELEGRAM_WEBAPP_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SITE_URL is not configured");
  }
  const base = new URL(configured || request.nextUrl.origin);
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
    throw new Error("SITE_URL must use HTTPS");
  }
  return new URL("/auth/recovery", base).toString();
}

export function createPasswordRecoveryProof(userId: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + PROOF_LIFETIME_SECONDS;
  const value = `${userId}.${expiresAt}`;
  return `${value}.${signature(value)}`;
}

export function verifyPasswordRecoveryProof(
  proof: string,
  expectedUserId: string,
): boolean {
  const match = proof.match(
    /^([0-9a-f-]{36})\.([0-9]{10})\.([A-Za-z0-9_-]{43})$/,
  );
  if (!match || match[1] !== expectedUserId) return false;
  const expiresAt = Number(match[2]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now() / 1000) {
    return false;
  }
  const value = `${match[1]}.${match[2]}`;
  const actual = Buffer.from(match[3]);
  const expected = Buffer.from(signature(value));
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}

export function clearPasswordRecoveryCookies(response: NextResponse) {
  for (const name of Object.values(passwordRecoveryCookies)) {
    response.cookies.set(name, "", {
      ...passwordRecoveryCookieOptions(),
      maxAge: 0,
    });
  }
}
