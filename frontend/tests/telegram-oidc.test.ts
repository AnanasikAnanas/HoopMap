import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTelegramOidcAttempt,
  validateTelegramIdToken,
} from "@/lib/supabase/telegram-oidc";

const clientId = "123456789";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicJwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "telegram-test-key",
  alg: "RS256",
  use: "sig",
};

function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: publicJwk.kid, typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "https://oauth.telegram.org",
      aud: clientId,
      sub: "424242",
      id: 424242,
      iat: now,
      exp: now + 600,
      nonce: "expected-nonce",
      given_name: "Игрок",
      family_name: "Тестовый",
      preferred_username: "player",
      picture: "https://example.test/avatar.jpg",
      ...overrides,
    }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

describe("Telegram web login OIDC", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_LOGIN_CLIENT_ID;
    delete process.env.TELEGRAM_LOGIN_CLIENT_SECRET;
  });

  it("creates a PKCE login attempt", () => {
    const first = createTelegramOidcAttempt();
    const second = createTelegramOidcAttempt();
    expect(first.state).not.toBe(second.state);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.verifier.length).toBeGreaterThan(43);
    expect(first.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("verifies a Telegram ID token and returns the shared identity", async () => {
    process.env.TELEGRAM_LOGIN_CLIENT_ID = clientId;
    process.env.TELEGRAM_LOGIN_CLIENT_SECRET = "client-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ keys: [publicJwk] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      validateTelegramIdToken(token(), "expected-nonce"),
    ).resolves.toEqual({
      telegramId: 424242,
      username: "player",
      firstName: "Игрок",
      lastName: "Тестовый",
      avatarUrl: "https://example.test/avatar.jpg",
    });
  });

  it("rejects a token issued for another login attempt", async () => {
    process.env.TELEGRAM_LOGIN_CLIENT_ID = clientId;
    process.env.TELEGRAM_LOGIN_CLIENT_SECRET = "client-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ keys: [publicJwk] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      validateTelegramIdToken(token(), "different-nonce"),
    ).rejects.toThrow("claims");
  });
});
