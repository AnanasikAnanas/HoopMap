"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { notificationsApi } from "@/lib/api";
import type { NotificationSettings } from "@/lib/types";

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaContextValue = {
  supported: boolean;
  isStandalone: boolean;
  isIos: boolean;
  isTelegramWebView: boolean;
  installAvailable: boolean;
  notificationPermission: NotificationPermission;
  subscribed: boolean;
  install(): Promise<boolean>;
  enableNotifications(): Promise<NotificationSettings>;
  disableNotifications(): Promise<NotificationSettings>;
};

const PwaContext = createContext<PwaContextValue | null>(null);

function decodeApplicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes.buffer;
}

function standaloneMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isTelegramWebView, setIsTelegramWebView] = useState(false);
  const [supported, setSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");

  useEffect(() => {
    let active = true;
    const canUsePush =
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    queueMicrotask(() => {
      if (!active) return;
      setSupported(canUsePush);
      setIsStandalone(standaloneMode());
      setIsIos(
        /iphone|ipad|ipod/i.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
      );
      setIsTelegramWebView(Boolean(window.Telegram?.WebApp?.initData));
      if ("Notification" in window) {
        setNotificationPermission(Notification.permission);
      }
    });

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (canUsePush) {
      void navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        .then(async (value) => {
          setRegistration(value);
          setSubscription(await value.pushManager.getSubscription());
        })
        .catch(() => {
          setSupported(false);
        });
    }
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    return choice.outcome === "accepted";
  }, [installPrompt]);

  const enableNotifications = useCallback(async () => {
    if (!supported) {
      throw new Error("Этот браузер не поддерживает Web Push");
    }
    if (isIos && !isStandalone) {
      throw new Error(
        "На iPhone сначала добавьте HOOPMAP на экран «Домой» и откройте его с иконки",
      );
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== "granted") {
      throw new Error("Разрешение на уведомления не выдано");
    }
    const ready = registration ?? (await navigator.serviceWorker.ready);
    let current = await ready.pushManager.getSubscription();
    let created = false;
    if (!current) {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
      if (!publicKey) {
        throw new Error("Публичный ключ уведомлений не настроен");
      }
      current = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(publicKey),
      });
      created = true;
    }
    const serialized = current.toJSON();
    if (
      !serialized.endpoint ||
      !serialized.keys?.p256dh ||
      !serialized.keys.auth
    ) {
      if (created) await current.unsubscribe();
      throw new Error("Браузер вернул неполную push-подписку");
    }
    try {
      const settings = await notificationsApi.subscribe({
        endpoint: serialized.endpoint,
        keys: {
          p256dh: serialized.keys.p256dh,
          auth: serialized.keys.auth,
        },
      });
      setSubscription(current);
      return settings;
    } catch (error) {
      if (created) await current.unsubscribe();
      throw error;
    }
  }, [isIos, isStandalone, registration, supported]);

  const disableNotifications = useCallback(async () => {
    const ready = registration ?? (await navigator.serviceWorker.ready);
    const current = subscription ?? (await ready.pushManager.getSubscription());
    if (!current) {
      throw new Error("Активная подписка не найдена");
    }
    const settings = await notificationsApi.unsubscribe(current.endpoint);
    await current.unsubscribe();
    setSubscription(null);
    return settings;
  }, [registration, subscription]);

  const value = useMemo<PwaContextValue>(
    () => ({
      supported,
      isStandalone,
      isIos,
      isTelegramWebView,
      installAvailable: Boolean(installPrompt),
      notificationPermission,
      subscribed: Boolean(subscription),
      install,
      enableNotifications,
      disableNotifications,
    }),
    [
      disableNotifications,
      enableNotifications,
      install,
      installPrompt,
      isIos,
      isStandalone,
      isTelegramWebView,
      notificationPermission,
      subscription,
      supported,
    ],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaContextValue {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwa must be used inside PwaProvider");
  return value;
}
