import { afterEach, describe, expect, it } from "vitest";
import {
  isValidGooglePkceVerifier,
  safeOAuthNext,
} from "@/lib/supabase/google-auth";
import { createPkceRequestClient } from "@/lib/supabase/server";

describe("Google OAuth", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("creates a PKCE authorization URL and keeps the verifier server-side", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project-ref.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";
    const attempt = createPkceRequestClient();
    const started = await attempt.client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://hoop-map.vercel.app/auth/callback",
        skipBrowserRedirect: true,
      },
    });

    expect(started.error).toBeNull();
    expect(started.data.url).toContain(
      "https://project-ref.supabase.co/auth/v1/authorize",
    );
    expect(started.data.url).toContain("code_challenge=");
    expect(isValidGooglePkceVerifier(attempt.getCodeVerifier())).toBe(true);
  });

  it("only accepts local redirect destinations and valid PKCE verifiers", () => {
    expect(safeOAuthNext("/profile/games")).toBe("/profile/games");
    expect(safeOAuthNext("https://evil.example")).toBe("/profile");
    expect(safeOAuthNext("//evil.example")).toBe("/profile");
    expect(isValidGooglePkceVerifier("a".repeat(56))).toBe(true);
    expect(isValidGooglePkceVerifier("short")).toBe(false);
  });
});
