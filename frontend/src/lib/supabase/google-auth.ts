import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const googleOAuthCookies = {
  verifier: "hoopmap_google_pkce_verifier",
  next: "hoopmap_google_next",
} as const;

export function safeOAuthNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value.slice(0, 500)
    : "/profile";
}

export function isValidGooglePkceVerifier(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

export function googleOAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60,
  };
}

export function googleCallbackUrl(request: NextRequest): string {
  const configured =
    process.env.SITE_URL?.trim() || process.env.TELEGRAM_WEBAPP_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SITE_URL is not configured");
  }
  const base = new URL(configured || request.nextUrl.origin);
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
    throw new Error("SITE_URL must use HTTPS");
  }
  return new URL("/auth/callback", base).toString();
}

export function clearGoogleOAuthCookies(response: NextResponse) {
  for (const name of Object.values(googleOAuthCookies)) {
    response.cookies.set(name, "", {
      ...googleOAuthCookieOptions(),
      maxAge: 0,
    });
  }
}
