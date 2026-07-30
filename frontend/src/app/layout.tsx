import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";
import { TelegramBootstrap } from "@/components/telegram-bootstrap";

export const metadata: Metadata = {
  applicationName: "HOOPMAP",
  title: {
    default: "HOOPMAP — баскетбольные площадки",
    template: "%s — HOOPMAP",
  },
  description: "Площадки, игры и баскетбольное сообщество рядом с вами",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/hoopmap-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/hoopmap-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HOOPMAP",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f26a2e" },
    { media: "(prefers-color-scheme: dark)", color: "#181c21" },
  ],
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
