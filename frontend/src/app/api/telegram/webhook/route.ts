import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  ensureTelegramUser,
  telegramWebhookSecret,
  type TelegramIdentity,
} from "@/lib/supabase/telegram-auth";
import { consumeTelegramAccountLink } from "@/lib/supabase/account-linking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
};
type TelegramMessage = {
  chat: { id: number };
  from?: TelegramUser;
  text?: string;
  location?: { latitude: number; longitude: number };
};
type TelegramUpdate = { update_id: number; message?: TelegramMessage };

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function webAppUrl(path: string): string {
  const base = process.env.TELEGRAM_WEBAPP_URL?.trim();
  if (!base) throw new Error("TELEGRAM_WEBAPP_URL is not configured");
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

async function telegram(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Telegram API returned ${response.status}`);
}

async function send(chatId: number, text: string, replyMarkup?: Record<string, unknown>) {
  await telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function inlineButton(label: string, path: string) {
  return { inline_keyboard: [[{ text: label, web_app: { url: webAppUrl(path) } }]] };
}

function identity(user: TelegramUser): TelegramIdentity {
  return {
    telegramId: user.id,
    username: user.username ?? "",
    firstName: user.first_name ?? "",
    lastName: user.last_name ?? "",
    avatarUrl: "",
  };
}

async function sendNearby(message: TelegramMessage) {
  const location = message.location!;
  const admin = createServiceClient();
  const nearby = await admin.rpc("nearby_courts", {
    lat: location.latitude,
    lon: location.longitude,
    radius_m: 5000,
  });
  if (nearby.error) throw nearby.error;
  const distances = new Map<number, number>(
    (nearby.data ?? []).map((item: { court_id: number; distance_m: number }) => [
      Number(item.court_id),
      Number(item.distance_m),
    ]),
  );
  const ids = Array.from(distances.keys());
  if (!ids.length) {
    await send(
      message.chat.id,
      "В радиусе 5 км площадок пока нет. Можете добавить первую!",
      inlineButton("Добавить площадку", "/courts/add"),
    );
    return;
  }
  const courts = await admin
    .from("courts")
    .select("id,name,address,condition,hoops_count,slug")
    .in("id", ids)
    .eq("status", "published");
  if (courts.error) throw courts.error;
  const ordered = (courts.data ?? [])
    .sort((a, b) => distances.get(Number(a.id))! - distances.get(Number(b.id))!)
    .slice(0, 5);
  if (!ordered.length) {
    await send(message.chat.id, "В радиусе 5 км опубликованных площадок пока нет.");
    return;
  }
  for (const court of ordered) {
    await send(
      message.chat.id,
      `🏀 <b>${court.name}</b>\n📍 ${distances.get(Number(court.id))} м · ${court.address}\n` +
        `Состояние: ${court.condition} · колец: ${court.hoops_count}`,
      inlineButton("Открыть площадку", `/courts/${court.slug}`),
    );
  }
}

async function handleMessage(message: TelegramMessage) {
  const parts = (message.text ?? "").trim().split(/\s+/);
  const command = parts[0].split("@")[0];
  const linkToken =
    command === "/start" && parts[1]?.startsWith("link_")
      ? parts[1].slice(5)
      : "";

  if (linkToken && message.from && !message.from.is_bot) {
    try {
      await consumeTelegramAccountLink(linkToken, identity(message.from));
      await send(
        message.chat.id,
        "✅ <b>Telegram подключён</b>\n\nТеперь на сайте и в Mini App используется один профиль. Площадки, игры и избранное сохранены.",
        inlineButton("Открыть профиль", "/profile"),
      );
    } catch {
      await send(
        message.chat.id,
        "Ссылка недействительна, уже использована или истекла. Создайте новую в профиле HOOPMAP.",
        inlineButton("Открыть профиль", "/profile"),
      );
    }
    return;
  }

  if (message.from && !message.from.is_bot)
    await ensureTelegramUser(identity(message.from));
  if (message.location) return sendNearby(message);
  if (command === "/start") {
    await send(
      message.chat.id,
      "🏀 <b>HOOPMAP</b> — площадки и открытые игры рядом.\n\nОткройте карту или добавьте новую площадку:",
      {
        inline_keyboard: [
          [{ text: "🏀 Открыть карту", web_app: { url: webAppUrl("/map") } }],
          [{ text: "➕ Добавить площадку", web_app: { url: webAppUrl("/courts/add") } }],
          [{ text: "🔥 Открытые игры", web_app: { url: webAppUrl("/games") } }],
        ],
      },
    );
    return;
  }
  if (command === "/map" || message.text === "🏀 Открыть карту") {
    return send(message.chat.id, "Откройте живую карту площадок:", inlineButton("Открыть карту", "/map"));
  }
  if (command === "/add" || message.text === "➕ Добавить площадку") {
    return send(
      message.chat.id,
      "Площадка появится после проверки модератором.",
      inlineButton("Добавить площадку", "/courts/add"),
    );
  }
  if (command === "/games" || message.text === "🔥 Игры сегодня") {
    const date = new Date().toISOString().slice(0, 10);
    return send(message.chat.id, "Открытые игры на сегодня:", inlineButton("Смотреть игры", `/games?date=${date}`));
  }
  if (command === "/profile") {
    return send(message.chat.id, "Ваш профиль HOOPMAP:", inlineButton("Открыть профиль", "/profile"));
  }
  if (command === "/nearby") {
    return send(message.chat.id, "Отправьте боту свою геолокацию — покажу ближайшие площадки.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supplied = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!safeEqual(supplied, telegramWebhookSecret())) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    const update = (await request.json()) as TelegramUpdate;
    if (!Number.isSafeInteger(update.update_id)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (update.message) await handleMessage(update.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "hoopmap-telegram-webhook" });
}
