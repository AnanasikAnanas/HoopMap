"use client";

import { useEffect, useRef, useState } from "react";

type WidgetConfiguration = {
  botUsername: string;
  authUrl: string;
};

export function TelegramLoginWidget({ next }: { next: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const target = container.current;
    if (!target) return;

    async function initialize() {
      try {
        const query = new URLSearchParams({ next });
        const response = await fetch(
          `/api/v1/auth/telegram/widget-config/?${query}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Telegram login is unavailable");
        const configuration = (await response.json()) as WidgetConfiguration;
        if (controller.signal.aborted || !target) return;

        target.replaceChildren();
        const script = document.createElement("script");
        script.async = true;
        script.src = "https://telegram.org/js/telegram-widget.js?22";
        script.setAttribute("data-telegram-login", configuration.botUsername);
        script.setAttribute("data-size", "large");
        script.setAttribute("data-radius", "999");
        script.setAttribute("data-userpic", "false");
        script.setAttribute("data-lang", "ru");
        script.setAttribute("data-auth-url", configuration.authUrl);
        target.appendChild(script);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }

    void initialize();
    return () => {
      controller.abort();
      target.replaceChildren();
    };
  }, [next]);

  if (error) {
    return (
      <p className="rounded-2xl bg-danger/10 p-4 text-sm font-bold text-danger">
        Не удалось загрузить вход через Telegram. Обновите страницу.
      </p>
    );
  }

  return (
    <div
      ref={container}
      className="flex min-h-12 items-center justify-center"
      aria-label="Войти через Telegram"
    >
      <span className="text-sm text-muted">Загружаем Telegram…</span>
    </div>
  );
}
