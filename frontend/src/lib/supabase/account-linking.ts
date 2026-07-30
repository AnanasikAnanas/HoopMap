import { createHash, randomBytes } from "node:crypto";
import { createServiceClient, type ProfileRecord } from "./server";
import type { TelegramIdentity } from "./telegram-auth";

const LINK_LIFETIME_MS = 10 * 60 * 1000;
const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function telegramBotUsername(): string {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (!username || !/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    throw new Error("TELEGRAM_BOT_USERNAME is not configured");
  }
  return username;
}

export function isValidAccountLinkToken(token: string): boolean {
  return LINK_TOKEN_PATTERN.test(token);
}

export async function issueTelegramAccountLink(profile: ProfileRecord) {
  if (profile.telegram_id) {
    throw new Error("Telegram is already linked");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_LIFETIME_MS).toISOString();
  const admin = createServiceClient();
  const removed = await admin
    .from("account_link_tokens")
    .delete()
    .eq("profile_id", profile.id);
  if (removed.error) throw removed.error;

  const created = await admin.from("account_link_tokens").insert({
    token_hash: hashToken(token),
    profile_id: profile.id,
    expires_at: expiresAt,
  });
  if (created.error) throw created.error;

  return {
    url: `https://t.me/${telegramBotUsername()}?start=link_${token}`,
    expires_at: expiresAt,
  };
}

export async function consumeTelegramAccountLink(
  token: string,
  identity: TelegramIdentity,
) {
  if (!isValidAccountLinkToken(token)) {
    throw new Error("Invalid account link token");
  }

  const admin = createServiceClient();
  const linked = await admin.rpc("consume_telegram_link", {
    target_token_hash: hashToken(token),
    target_telegram_id: identity.telegramId,
    telegram_username: identity.username,
    telegram_first_name: identity.firstName,
    telegram_last_name: identity.lastName,
  });
  if (linked.error) throw linked.error;

  const result = Array.isArray(linked.data) ? linked.data[0] : linked.data;
  const previousAuthUserId = result?.previous_auth_user_id;
  if (typeof previousAuthUserId === "string" && previousAuthUserId) {
    const removed = await admin.auth.admin.deleteUser(previousAuthUserId);
    if (removed.error) {
      console.error("Could not remove merged Telegram auth user");
    }
  }
  return Number(result?.linked_profile_id);
}
