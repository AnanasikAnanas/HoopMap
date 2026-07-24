import {
  createHash,
  createPublicKey,
  randomBytes,
  type JsonWebKey,
  verify as verifySignature,
} from "node:crypto";
import type { TelegramIdentity } from "./telegram-auth";

const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const TELEGRAM_JWKS_URL =
  "https://oauth.telegram.org/.well-known/jwks.json";

type TelegramTokenClaims = {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  nonce?: unknown;
  id?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  preferred_username?: unknown;
  picture?: unknown;
};

type TelegramJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function decodeJsonPart<T>(value: string): T {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    throw new Error("Malformed Telegram ID token");
  }
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function audienceContains(audience: unknown, clientId: string): boolean {
  return typeof audience === "string"
    ? audience === clientId
    : Array.isArray(audience) &&
        audience.some((value) => String(value) === clientId);
}

async function telegramKey(kid: string): Promise<TelegramJwk> {
  const response = await fetch(TELEGRAM_JWKS_URL, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load Telegram signing keys");
  const payload = (await response.json()) as { keys?: TelegramJwk[] };
  const key = payload.keys?.find(
    (candidate) =>
      candidate.kid === kid &&
      (!candidate.alg || candidate.alg === "RS256") &&
      (!candidate.use || candidate.use === "sig"),
  );
  if (!key) throw new Error("Telegram signing key was not found");
  return key;
}

export function telegramLoginConfig() {
  return {
    clientId: required("TELEGRAM_LOGIN_CLIENT_ID"),
    clientSecret: required("TELEGRAM_LOGIN_CLIENT_SECRET"),
  };
}

export function createTelegramOidcAttempt() {
  const verifier = randomBytes(48).toString("base64url");
  return {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

export async function validateTelegramIdToken(
  idToken: string,
  expectedNonce: string,
): Promise<TelegramIdentity> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed Telegram ID token");
  const header = decodeJsonPart<{ alg?: unknown; kid?: unknown }>(parts[0]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("Unsupported Telegram token signature");
  }
  const key = await telegramKey(header.kid);
  const verified = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key, format: "jwk" }),
    Buffer.from(parts[2], "base64url"),
  );
  if (!verified) throw new Error("Invalid Telegram token signature");

  const claims = decodeJsonPart<TelegramTokenClaims>(parts[1]);
  const { clientId } = telegramLoginConfig();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(claims.exp);
  const issuedAt = Number(claims.iat);
  if (
    claims.iss !== TELEGRAM_ISSUER ||
    !audienceContains(claims.aud, clientId) ||
    !Number.isInteger(expiresAt) ||
    expiresAt <= now ||
    !Number.isInteger(issuedAt) ||
    issuedAt > now + 60 ||
    now - issuedAt > 3600 ||
    claims.nonce !== expectedNonce
  ) {
    throw new Error("Invalid Telegram token claims");
  }

  const telegramId = Number(claims.id ?? claims.sub);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw new Error("Invalid Telegram user");
  }
  const fullName = safeText(claims.name, 300);
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName =
    safeText(claims.given_name, 150) || nameParts.shift()?.slice(0, 150) || "";
  const lastName =
    safeText(claims.family_name, 150) ||
    nameParts.join(" ").slice(0, 150);
  const avatar = safeText(claims.picture, 500);
  return {
    telegramId,
    username: safeText(claims.preferred_username, 150),
    firstName,
    lastName,
    avatarUrl: avatar.startsWith("https://") ? avatar : "",
  };
}

export async function exchangeTelegramCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<string> {
  const { clientId, clientSecret } = telegramLoginConfig();
  const response = await fetch(`${TELEGRAM_ISSUER}/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: clientId,
      code_verifier: input.verifier,
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    id_token?: unknown;
  } | null;
  if (!response.ok || typeof payload?.id_token !== "string") {
    throw new Error("Telegram authorization code exchange failed");
  }
  return payload.id_token;
}
