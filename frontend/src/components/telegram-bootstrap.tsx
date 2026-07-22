"use client";

import Script from "next/script";

export function TelegramBootstrap({ nonce }: { nonce?: string }) {
  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="afterInteractive"
      nonce={nonce}
      onLoad={() => window.dispatchEvent(new Event("telegram-webapp-ready"))}
    />
  );
}
