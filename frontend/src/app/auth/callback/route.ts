import { NextRequest, NextResponse } from "next/server";
import { ensureEmailProfile } from "@/lib/supabase/email-auth";
import {
  clearGoogleOAuthCookies,
  googleOAuthCookies,
  isValidGooglePkceVerifier,
  safeOAuthNext,
} from "@/lib/supabase/google-auth";
import {
  createPkceRequestClient,
  refreshCookieName,
  refreshCookieOptions,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const loginUrl = new URL("/login", request.nextUrl.origin);
  try {
    if (request.nextUrl.searchParams.has("error")) {
      throw new Error("Google rejected authorization");
    }
    const code = request.nextUrl.searchParams.get("code") ?? "";
    const verifier =
      request.cookies.get(googleOAuthCookies.verifier)?.value ?? "";
    if (!code || code.length > 4096 || !isValidGooglePkceVerifier(verifier)) {
      throw new Error("Invalid Google OAuth callback");
    }

    const { client } = createPkceRequestClient(verifier);
    const exchanged = await client.auth.exchangeCodeForSession(code);
    if (exchanged.error || !exchanged.data.user || !exchanged.data.session) {
      throw exchanged.error ?? new Error("Google session was not created");
    }

    await ensureEmailProfile(exchanged.data.user);
    const destination = new URL(
      safeOAuthNext(
        request.cookies.get(googleOAuthCookies.next)?.value ?? "/profile",
      ),
      request.nextUrl.origin,
    );
    const response = NextResponse.redirect(destination);
    response.cookies.set(
      refreshCookieName(),
      exchanged.data.session.refresh_token,
      refreshCookieOptions(),
    );
    clearGoogleOAuthCookies(response);
    return response;
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    loginUrl.searchParams.set("error", "google");
    const response = NextResponse.redirect(loginUrl);
    clearGoogleOAuthCookies(response);
    return response;
  }
}
