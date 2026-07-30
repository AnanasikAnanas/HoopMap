import { describe, expect, it } from "vitest";
import {
  emailLoginSchema,
  emailRegistrationSchema,
  passwordUpdateSchema,
} from "@/lib/supabase/email-auth";

describe("email authentication validation", () => {
  it("normalizes valid registration data", () => {
    expect(
      emailRegistrationSchema.parse({
        email: "  Player@Example.COM ",
        password: "basketball2026",
        name: "  Алексей Игрок  ",
      }),
    ).toEqual({
      email: "player@example.com",
      password: "basketball2026",
      name: "Алексей Игрок",
    });
  });

  it("rejects weak registration passwords", () => {
    expect(
      emailRegistrationSchema.safeParse({
        email: "player@example.com",
        password: "onlyletters",
        name: "Игрок",
      }).success,
    ).toBe(false);
    expect(
      emailRegistrationSchema.safeParse({
        email: "player@example.com",
        password: "1234567890",
        name: "Игрок",
      }).success,
    ).toBe(false);
  });

  it("does not apply the new-password policy to existing logins", () => {
    expect(
      emailLoginSchema.safeParse({
        email: "player@example.com",
        password: "legacy",
      }).success,
    ).toBe(true);
  });

  it("applies the strong-password policy during recovery", () => {
    expect(
      passwordUpdateSchema.safeParse({ password: "basketball2026" }).success,
    ).toBe(true);
    expect(
      passwordUpdateSchema.safeParse({ password: "onlyletters" }).success,
    ).toBe(false);
  });
});
