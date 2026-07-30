import { describe, expect, it } from "vitest";
import { isValidAccountLinkToken } from "@/lib/supabase/account-linking";

describe("Telegram account linking", () => {
  it("accepts only 32-byte base64url tokens", () => {
    expect(
      isValidAccountLinkToken(
        "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE",
      ),
    ).toBe(true);
    expect(isValidAccountLinkToken("short")).toBe(false);
    expect(
      isValidAccountLinkToken(
        "Abcdefghijklmnopqrstuvwxyz0123456789+/ABCDE",
      ),
    ).toBe(false);
  });
});
