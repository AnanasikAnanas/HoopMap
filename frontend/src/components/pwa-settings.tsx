"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  Download,
  ExternalLink,
  Smartphone,
} from "lucide-react";
import { useState } from "react";
import { usePwa } from "@/components/pwa-provider";
import { Button, Card } from "@/components/ui";
import { notificationsApi } from "@/lib/api";
import type { NotificationSettings } from "@/lib/types";

function errorMessage(error: unknown): string {
  if (error instanceof Error && !error.message.startsWith("API request")) {
    return error.message;
  }
  return "Не удалось изменить настройку. Попробуйте ещё раз.";
}

function SettingToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        className="size-5 accent-orange"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function PwaSettings() {
  const pwa = usePwa();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const settings = useQuery({
    queryKey: ["notification-settings"],
    queryFn: notificationsApi.settings,
    retry: false,
  });
  const syncSettings = (value: NotificationSettings) => {
    queryClient.setQueryData(["notification-settings"], value);
  };
  const subscribe = useMutation({
    mutationFn: pwa.enableNotifications,
    onSuccess: (value) => {
      syncSettings(value);
      setMessage("Уведомления включены для этого устройства.");
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const unsubscribe = useMutation({
    mutationFn: pwa.disableNotifications,
    onSuccess: (value) => {
      syncSettings(value);
      setMessage("Уведомления на этом устройстве отключены.");
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const update = useMutation({
    mutationFn: notificationsApi.update,
    onSuccess: syncSettings,
    onError: (error) => setMessage(errorMessage(error)),
  });
  const test = useMutation({
    mutationFn: notificationsApi.test,
    onSuccess: ({ delivered }) =>
      setMessage(
        delivered
          ? "Тестовое уведомление отправлено."
          : "Подписка сохранена, но это устройство не приняло уведомление.",
      ),
    onError: (error) => setMessage(errorMessage(error)),
  });
  const value = settings.data;
  const busy = subscribe.isPending || unsubscribe.isPending || update.isPending;

  return (
    <Card className="mt-5 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 shrink-0 text-orange" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Приложение и уведомления</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Установите HOOPMAP на телефон и получайте напоминания, даже когда
            приложение закрыто.
          </p>

          <div className="mt-5 rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">
                  {pwa.isStandalone
                    ? "HOOPMAP установлен"
                    : "Установить HOOPMAP"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {pwa.isStandalone
                    ? "Приложение открыто в отдельном окне."
                    : "Иконка появится на главном экране устройства."}
                </p>
              </div>
              {!pwa.isStandalone && pwa.installAvailable && (
                <Button
                  type="button"
                  onClick={() => {
                    setMessage("");
                    void pwa.install().then((accepted) => {
                      setMessage(
                        accepted
                          ? "Установка началась."
                          : "Установку можно выполнить позже.",
                      );
                    });
                  }}
                >
                  <Download className="mr-2 size-4" />
                  Установить
                </Button>
              )}
            </div>
            {!pwa.isStandalone && pwa.isIos && (
              <p className="mt-3 text-xs leading-5 text-muted">
                На iPhone откройте сайт в Safari, нажмите «Поделиться», затем
                «На экран Домой».
              </p>
            )}
            {pwa.isTelegramWebView && !pwa.isStandalone && (
              <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted">
                <ExternalLink className="mt-0.5 size-4 shrink-0" />
                Для установки откройте сайт во внешнем Safari или Chrome.
              </p>
            )}
          </div>

          <div className="mt-3 rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Push-уведомления</p>
                <p className="mt-1 text-xs text-muted">
                  {pwa.subscribed
                    ? `Подключено устройств: ${value?.subscriptions_count ?? 1}`
                    : "На этом устройстве уведомления выключены."}
                </p>
              </div>
              {pwa.subscribed ? (
                <Button
                  type="button"
                  className="bg-canvas text-ink ring-1 ring-line"
                  disabled={busy}
                  onClick={() => {
                    setMessage("");
                    unsubscribe.mutate();
                  }}
                >
                  <BellOff className="mr-2 size-4" />
                  Отключить
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={
                    busy ||
                    !pwa.supported ||
                    settings.isLoading ||
                    !value?.server_configured
                  }
                  onClick={() => {
                    setMessage("");
                    subscribe.mutate();
                  }}
                >
                  <Bell className="mr-2 size-4" />
                  Включить
                </Button>
              )}
            </div>
            {!pwa.supported && (
              <p className="mt-3 text-xs text-muted">
                Этот браузер или встроенное окно не поддерживает Web Push.
              </p>
            )}
            {value && !value.server_configured && (
              <p className="mt-3 text-xs text-muted">
                Серверные ключи уведомлений ещё не добавлены в Vercel.
              </p>
            )}
            {pwa.notificationPermission === "denied" && (
              <p className="mt-3 text-xs text-danger">
                Уведомления запрещены в настройках браузера или системы.
              </p>
            )}
          </div>

          {value && (
            <div className="mt-3 divide-y divide-line rounded-2xl border border-line px-4">
              <SettingToggle
                label="Изменения в играх"
                description="Вступления, выходы, переносы и отмены."
                checked={value.game_updates}
                disabled={busy}
                onChange={(game_updates) => update.mutate({ game_updates })}
              />
              <SettingToggle
                label="Напоминания об играх"
                description="Автоматические уведомления перед началом."
                checked={value.game_reminders}
                disabled={busy}
                onChange={(game_reminders) => update.mutate({ game_reminders })}
              />
              <SettingToggle
                label="За 24 часа"
                description="Успеть скорректировать планы."
                checked={value.reminder_24h}
                disabled={busy || !value.game_reminders}
                onChange={(reminder_24h) => update.mutate({ reminder_24h })}
              />
              <SettingToggle
                label="За 2 часа"
                description="Финальное напоминание перед выходом."
                checked={value.reminder_2h}
                disabled={busy || !value.game_reminders}
                onChange={(reminder_2h) => update.mutate({ reminder_2h })}
              />
            </div>
          )}

          {pwa.subscribed && (
            <Button
              type="button"
              className="mt-4 bg-canvas text-ink ring-1 ring-line"
              disabled={test.isPending}
              onClick={() => {
                setMessage("");
                test.mutate();
              }}
            >
              {test.isPending ? "Отправляем…" : "Проверить уведомление"}
            </Button>
          )}
          {message && (
            <p aria-live="polite" className="mt-3 text-sm text-muted">
              {message}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
