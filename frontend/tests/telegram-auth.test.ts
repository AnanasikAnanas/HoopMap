import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { validateTelegramInitData } from "@/lib/supabase/telegram-auth";

const token = "123456:test-bot-token";

function signedInitData(overrides: Record<string, string> = {}) {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAE-test",
    user: JSON.stringify({
      id: 424242,
      username: "player",
      first_name: "Игрок",
      last_name: "Тестовый",
      photo_url: "https://example.test/avatar.jpg",
    }),
    ...overrides,
  });
  const dataCheckString = Array.from(values.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  values.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return values.toString();
}

describe("Telegram server authentication", () => {
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS;
  });

  it("accepts valid signed initData", () => {
    process.env.TELEGRAM_BOT_TOKEN = token;
    expect(validateTelegramInitData(signedInitData())).toEqual({
      telegramId: 424242,
      username: "player",
      firstName: "Игрок",
      lastName: "Тестовый",
      avatarUrl: "https://example.test/avatar.jpg",
    });
  });

  it("rejects tampered and expired initData", () => {
    process.env.TELEGRAM_BOT_TOKEN = token;
    const tampered = new URLSearchParams(signedInitData());
    tampered.set("auth_date", String(Math.floor(Date.now() / 1000) + 500));
    expect(() => validateTelegramInitData(tampered.toString())).toThrow(
      "Invalid Telegram signature",
    );

    process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS = "60";
    expect(() =>
      validateTelegramInitData(
        signedInitData({ auth_date: String(Math.floor(Date.now() / 1000) - 120) }),
      ),
    ).toThrow("expired");
  });
});
