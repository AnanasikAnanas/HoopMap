import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  createRequestClient,
  createServiceClient,
  type ProfileRecord,
} from "./server";

export type TelegramIdentity = {
  telegramId: number;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
};

function safeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function telegramBotToken(): string {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) throw new Error("Telegram bot is not configured");
  return botToken;
}

function validateAuthDate(value: string | null) {
  const authDate = Number(value);
  const maxAge = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 3600);
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isInteger(authDate) ||
    !Number.isFinite(maxAge) ||
    maxAge < 60 ||
    authDate > now + 60 ||
    now - authDate > maxAge
  ) {
    throw new Error("Telegram authentication has expired");
  }
}

export function validateTelegramInitData(initData: string): TelegramIdentity {
  if (!initData || initData.length > 8192)
    throw new Error("Malformed Telegram initData");
  const botToken = telegramBotToken();

  const params = new URLSearchParams(initData);
  const keys = Array.from(params.keys());
  if (keys.length !== new Set(keys).size)
    throw new Error("Duplicate Telegram fields");
  const receivedHash = params.get("hash") ?? "";
  params.delete("hash");
  if (!/^[a-f0-9]{64}$/i.test(receivedHash))
    throw new Error("Telegram signature is missing");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest();
  const received = Buffer.from(receivedHash, "hex");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw new Error("Invalid Telegram signature");
  }

  validateAuthDate(params.get("auth_date"));

  let rawUser: unknown;
  try {
    rawUser = JSON.parse(params.get("user") ?? "");
  } catch {
    throw new Error("Malformed Telegram user");
  }
  if (!rawUser || typeof rawUser !== "object")
    throw new Error("Malformed Telegram user");
  const user = rawUser as Record<string, unknown>;
  const telegramId = Number(user.id);
  if (
    !Number.isSafeInteger(telegramId) ||
    telegramId <= 0 ||
    user.is_bot === true
  ) {
    throw new Error("Malformed Telegram user");
  }
  const avatar = safeText(user.photo_url, 500);
  return {
    telegramId,
    username: safeText(user.username, 150),
    firstName: safeText(user.first_name, 150),
    lastName: safeText(user.last_name, 150),
    avatarUrl: avatar.startsWith("https://") ? avatar : "",
  };
}

export function validateTelegramLoginWidgetData(
  params: URLSearchParams,
): TelegramIdentity {
  if (!params.size || params.toString().length > 8192) {
    throw new Error("Malformed Telegram login data");
  }
  const keys = Array.from(params.keys());
  if (keys.length !== new Set(keys).size) {
    throw new Error("Duplicate Telegram fields");
  }
  const allowed = new Set([
    "id",
    "first_name",
    "last_name",
    "username",
    "photo_url",
    "auth_date",
    "hash",
  ]);
  if (keys.some((key) => !allowed.has(key))) {
    throw new Error("Unexpected Telegram login field");
  }

  const receivedHash = params.get("hash") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error("Telegram signature is missing");
  }
  const signed = new URLSearchParams(params);
  signed.delete("hash");
  const dataCheckString = Array.from(signed.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHash("sha256").update(telegramBotToken()).digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest();
  const received = Buffer.from(receivedHash, "hex");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw new Error("Invalid Telegram signature");
  }
  validateAuthDate(params.get("auth_date"));

  const telegramId = Number(params.get("id"));
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw new Error("Malformed Telegram user");
  }
  const avatar = safeText(params.get("photo_url"), 500);
  return {
    telegramId,
    username: safeText(params.get("username"), 150),
    firstName: safeText(params.get("first_name"), 150),
    lastName: safeText(params.get("last_name"), 150),
    avatarUrl: avatar.startsWith("https://") ? avatar : "",
  };
}

function telegramEmail(telegramId: number): string {
  return `tg_${telegramId}@users.hoopmap.invalid`;
}

export async function ensureTelegramUser(
  identity: TelegramIdentity,
): Promise<ProfileRecord> {
  const admin = createServiceClient();
  const existing = await admin
    .from("profiles")
    .select("*")
    .eq("telegram_id", identity.telegramId)
    .maybeSingle();

  let authUserId = (existing.data as ProfileRecord | null)?.auth_user_id;
  if (!authUserId) {
    const created = await admin.auth.admin.createUser({
      email: telegramEmail(identity.telegramId),
      email_confirm: true,
      user_metadata: { provider: "telegram", telegram_id: identity.telegramId },
    });
    if (created.error || !created.data.user) {
      const retried = await admin
        .from("profiles")
        .select("*")
        .eq("telegram_id", identity.telegramId)
        .single();
      if (retried.error) throw created.error ?? retried.error;
      authUserId = (retried.data as ProfileRecord).auth_user_id;
    } else {
      authUserId = created.data.user.id;
    }
  }

  const username = identity.username || `tg_${identity.telegramId}`;
  const updated = await admin
    .from("profiles")
    .upsert(
      {
        auth_user_id: authUserId,
        telegram_id: identity.telegramId,
        username,
        first_name: identity.firstName,
        last_name: identity.lastName,
        avatar_url: identity.avatarUrl,
      },
      { onConflict: "telegram_id" },
    )
    .select("*")
    .single();
  if (updated.error) throw updated.error;
  return updated.data as ProfileRecord;
}

export async function createTelegramSession(profile: ProfileRecord) {
  const admin = createServiceClient();
  const authUser = await admin.auth.admin.getUserById(profile.auth_user_id);
  const email = authUser.data.user?.email;
  if (authUser.error || !email) {
    throw authUser.error ?? new Error("Could not find linked account");
  }
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link.data.properties?.hashed_token;
  if (link.error || !tokenHash)
    throw link.error ?? new Error("Could not create session");
  const client = createRequestClient();
  const verified = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verified.error || !verified.data.session) {
    throw verified.error ?? new Error("Could not verify session");
  }
  return verified.data.session;
}

export function telegramWebhookSecret(): string {
  const configured = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (configured) return configured;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("Telegram bot is not configured");
  return createHash("sha256").update(token).digest("hex");
}
