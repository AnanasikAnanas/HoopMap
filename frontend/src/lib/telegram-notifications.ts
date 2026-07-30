import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

function gameUrl(path: string): string | null {
  const configured =
    process.env.TELEGRAM_WEBAPP_URL?.trim() || process.env.SITE_URL?.trim();
  if (!configured) return null;
  try {
    const base = new URL(configured);
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
      return null;
    }
    return new URL(
      path,
      configured.endsWith("/") ? configured : `${configured}/`,
    ).toString();
  } catch {
    return null;
  }
}

export async function notifyProfilesInTelegram(
  profileIds: number[],
  text: string,
  path: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const uniqueIds = Array.from(
    new Set(profileIds.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ).slice(0, 100);
  if (!token || !uniqueIds.length) return;

  const profiles = await createServiceClient()
    .from("profiles")
    .select("telegram_id")
    .in("id", uniqueIds)
    .not("telegram_id", "is", null);
  if (profiles.error) {
    console.error("Could not load Telegram notification recipients");
    return;
  }

  const url = gameUrl(path);
  const recipients = Array.from(
    new Set(
      (profiles.data ?? [])
        .map((profile) => Number(profile.telegram_id))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  );
  for (let offset = 0; offset < recipients.length; offset += 20) {
    await Promise.all(
      recipients.slice(offset, offset + 20).map(async (chatId) => {
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: text.slice(0, 3900),
              disable_web_page_preview: true,
              ...(url
                ? {
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: "Открыть игру", web_app: { url } }],
                      ],
                    },
                  }
                : {}),
            }),
            signal: AbortSignal.timeout(4000),
          });
        } catch {
          // Notifications must never roll back a successful game action.
        }
      }),
    );
  }
}
