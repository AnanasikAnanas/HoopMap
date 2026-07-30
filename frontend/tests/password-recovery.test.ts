import { describe, expect, it } from "vitest";
import {
  createPasswordRecoveryProof,
  isValidRecoveryPkceVerifier,
  verifyPasswordRecoveryProof,
} from "@/lib/supabase/password-recovery";

describe("password recovery security", () => {
  const userId = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts a signed proof only for the intended user", () => {
    const proof = createPasswordRecoveryProof(userId);
    expect(verifyPasswordRecoveryProof(proof, userId)).toBe(true);
    expect(
      verifyPasswordRecoveryProof(
        proof,
        "123e4567-e89b-12d3-a456-426614174999",
      ),
    ).toBe(false);
  });

  it("rejects a modified recovery proof", () => {
    const proof = createPasswordRecoveryProof(userId);
    expect(
      verifyPasswordRecoveryProof(`${proof.slice(0, -1)}A`, userId),
    ).toBe(false);
  });

  it("validates PKCE verifier shape", () => {
    expect(isValidRecoveryPkceVerifier("a".repeat(43))).toBe(true);
    expect(isValidRecoveryPkceVerifier("a".repeat(42))).toBe(false);
    expect(isValidRecoveryPkceVerifier(`${"a".repeat(42)}!`)).toBe(false);
  });
});
