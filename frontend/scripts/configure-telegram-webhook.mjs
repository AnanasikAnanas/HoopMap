const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const appUrl = process.env.TELEGRAM_WEBAPP_URL?.trim();

if (!token || !secret || !appUrl) {
  throw new Error(
    "Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and TELEGRAM_WEBAPP_URL before running this command.",
  );
}
if (secret.length < 32) {
  throw new Error("TELEGRAM_WEBHOOK_SECRET must contain at least 32 characters.");
}

const webhookUrl = new URL("/api/telegram/webhook", appUrl).toString();
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  }),
});
const result = await response.json();
if (!response.ok || !result.ok) {
  throw new Error(`Telegram rejected the webhook: ${JSON.stringify(result)}`);
}
console.log(`Telegram webhook configured: ${webhookUrl}`);
