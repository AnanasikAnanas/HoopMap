import { NextRequest, NextResponse } from "next/server";
import { ensureEmailProfile } from "@/lib/supabase/email-auth";
import {
  clearPasswordRecoveryCookies,
  createPasswordRecoveryProof,
  isValidRecoveryPkceVerifier,
  passwordRecoveryCookieOptions,
  passwordRecoveryCookies,
} from "@/lib/supabase/password-recovery";
import {
  createPkceRequestClient,
  refreshCookieName,
  refreshCookieOptions,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const failed = new URL("/forgot-password?error=link", request.nextUrl.origin);
  try {
    const code = request.nextUrl.searchParams.get("code") ?? "";
    const verifier =
      request.cookies.get(passwordRecoveryCookies.verifier)?.value ?? "";
    if (!code || code.length > 4096 || !isValidRecoveryPkceVerifier(verifier)) {
      throw new Error("Invalid password recovery callback");
    }

    const { client } = createPkceRequestClient(verifier);
    const exchanged = await client.auth.exchangeCodeForSession(code);
    if (exchanged.error || !exchanged.data.user || !exchanged.data.session) {
      throw exchanged.error ?? new Error("Recovery session was not created");
    }
    await ensureEmailProfile(exchanged.data.user);

    const response = NextResponse.redirect(
      new URL("/reset-password", request.nextUrl.origin),
    );
    response.cookies.set(
      refreshCookieName(),
      exchanged.data.session.refresh_token,
      refreshCookieOptions(),
    );
    response.cookies.set(
      passwordRecoveryCookies.proof,
      createPasswordRecoveryProof(exchanged.data.user.id),
      passwordRecoveryCookieOptions(),
    );
    response.cookies.set(passwordRecoveryCookies.verifier, "", {
      ...passwordRecoveryCookieOptions(),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("Password recovery callback failed", error);
    const response = NextResponse.redirect(failed);
    clearPasswordRecoveryCookies(response);
    return response;
  }
}
