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
        onEvent(event: "themeChanged", fn: () => void): void;
        offEvent(event: "themeChanged", fn: () => void): void;
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
    let removeThemeListener: (() => void) | undefined;
    const syncTheme = (telegramTheme?: string) => {
      if (localStorage.getItem("hoopmap-theme")) return;
      const isDark = telegramTheme
        ? telegramTheme === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = isDark ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      window.dispatchEvent(
        new CustomEvent("hoopmap-theme-change", { detail: theme }),
      );
    };
    const initializeTelegram = () => {
      if (initialized) return;
      const webApp = window.Telegram?.WebApp;
      if (!webApp) {
        syncTheme();
        if (!restoreStarted) {
          restoreStarted = true;
          void restoreSession();
        }
        return;
      }
      initialized = true;
      webApp.ready();
      webApp.expand();
      syncTheme(webApp.colorScheme);
      const onThemeChanged = () => syncTheme(webApp.colorScheme);
      webApp.onEvent("themeChanged", onThemeChanged);
      removeThemeListener = () =>
        webApp.offEvent("themeChanged", onThemeChanged);
      if (webApp.initData) {
        void telegramLogin(webApp.initData).then((user) => {
          client.setQueryData(["me"], user);
        });
      } else {
        void restoreSession();
      }
    };
    initializeTelegram();
    window.addEventListener("telegram-webapp-ready", initializeTelegram);
    return () => {
      removeThemeListener?.();
      window.removeEventListener("telegram-webapp-ready", initializeTelegram);
    };
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
