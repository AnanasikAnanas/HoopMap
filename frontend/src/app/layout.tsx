import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";
import { TelegramBootstrap } from "@/components/telegram-bootstrap";

export const metadata: Metadata = {
  title: {
    default: "HOOPMAP — баскетбольные площадки",
    template: "%s — HOOPMAP",
  },
  description: "Площадки, игры и баскетбольное сообщество рядом с вами",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="ru">
      <body>
        <TelegramBootstrap nonce={nonce} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
