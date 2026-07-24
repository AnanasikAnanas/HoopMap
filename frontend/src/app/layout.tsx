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
  const themeScript = `
    (() => {
      try {
        const saved = localStorage.getItem("hoopmap-theme");
        const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = dark ? "dark" : "light";
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
      } catch {}
    })();
  `;
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body>
        <TelegramBootstrap nonce={nonce} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
