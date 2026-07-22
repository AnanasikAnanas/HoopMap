"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { restoreSession, telegramLogin } from "@/lib/api";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready(): void;
        expand(): void;
        colorScheme: string;
        BackButton: {
          show(): void;
          hide(): void;
          onClick(fn: () => void): void;
        };
      };
    };
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  useEffect(() => {
    let initialized = false;
    let restoreStarted = false;
    const initializeTelegram = () => {
      if (initialized) return;
      const webApp = window.Telegram?.WebApp;
      if (!webApp) {
        if (!restoreStarted) {
          restoreStarted = true;
          void restoreSession();
        }
        return;
      }
      initialized = true;
      webApp.ready();
      webApp.expand();
      document.documentElement.dataset.telegramTheme = webApp.colorScheme;
      if (webApp.initData) {
        void telegramLogin(webApp.initData);
      } else {
        void restoreSession();
      }
    };
    initializeTelegram();
    window.addEventListener("telegram-webapp-ready", initializeTelegram);
    return () =>
      window.removeEventListener("telegram-webapp-ready", initializeTelegram);
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
