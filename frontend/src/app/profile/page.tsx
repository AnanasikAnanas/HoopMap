"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MapPin, MapPinned, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header, MobileNav } from "@/components/header";
import { Button, Card } from "@/components/ui";
import { authApi, logout } from "@/lib/api";

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [locationMessage, setLocationMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const { data: user, isError } = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false,
  });
  const mapHome = useMutation({
    mutationFn: authApi.updateMapHome,
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      setLocationMessage(
        updated.map_home
          ? "Приблизительный район сохранён."
          : "Сохранённый район удалён.",
      );
    },
    onError: () => setLocationMessage("Не удалось обновить настройку."),
  });
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });
  const saveCurrentArea = () => {
    setLocationMessage("");
    if (!("geolocation" in navigator)) {
      setLocationMessage("Геолокация недоступна на этом устройстве.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        mapHome.mutate({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => {
        setLocating(false);
        setLocationMessage(
          "Не удалось получить геопозицию. Проверьте разрешение браузера.",
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 5 * 60_000,
      },
    );
  };
  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-10 pb-24">
        <div className="rounded-3xl bg-dark p-8 text-white">
          <p className="text-xs uppercase tracking-widest text-white/50">
            Профиль игрока
          </p>
          <h1 className="display mt-3 text-3xl">
            {user
              ? `${user.first_name} ${user.last_name}`.trim() || user.username
              : "HOOPMAP игрок"}
          </h1>
          <p className="mt-2 text-white/60">
            {user
              ? `Репутация: ${user.reputation} · ${user.role}`
              : isError
                ? "Войдите или создайте аккаунт, чтобы открыть профиль"
                : "Загружаем профиль…"}
          </p>
          {isError && (
            <Link
              href="/login?next=/profile"
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-orange px-5 text-sm font-bold text-white"
            >
              Войти или зарегистрироваться
            </Link>
          )}
          {user && (
            <Button
              type="button"
              className="mt-5 bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              {signOut.isPending ? "Выходим…" : "Выйти"}
            </Button>
          )}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            [Heart, "Избранное", "Сохранённые площадки", "/profile/favorites"],
            [MapPin, "Мои площадки", "Добавленные вами", "/profile/courts"],
            [Trophy, "Мои игры", "Созданные и выбранные", "/profile/games"],
          ].map(([Icon, title, text, href]) => (
            <Link key={String(title)} href={String(href)}>
              <Card className="h-full p-6">
                <Icon className="text-orange" />
                <h2 className="mt-8 font-bold">{String(title)}</h2>
                <p className="mt-1 text-sm text-muted">{String(text)}</p>
              </Card>
            </Link>
          ))}
        </div>
        {user && (
          <Card className="mt-5 p-5 md:p-6">
            <div className="flex items-start gap-3">
              <MapPinned className="mt-0.5 shrink-0 text-orange" />
              <div className="flex-1">
                <h2 className="font-bold">Стартовый район карты</h2>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {user.map_home
                    ? "Сохранён приблизительный район. Точные координаты не хранятся."
                    : "Можно сохранить округлённую геопозицию примерно до 1 км для входа с других устройств."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={mapHome.isPending || locating}
                    onClick={saveCurrentArea}
                  >
                    {locating
                      ? "Определяем…"
                      : user.map_home
                        ? "Обновить район"
                        : "Сохранить район"}
                  </Button>
                  {user.map_home && (
                    <Button
                      type="button"
                      className="bg-canvas text-ink ring-1 ring-line"
                      disabled={mapHome.isPending}
                      onClick={() => mapHome.mutate(null)}
                    >
                      Удалить
                    </Button>
                  )}
                </div>
                {locationMessage && (
                  <p className="mt-3 text-sm text-muted">{locationMessage}</p>
                )}
              </div>
            </div>
          </Card>
        )}
        {user?.role !== "user" && (
          <Link
            className="mt-5 inline-block font-bold text-orange"
            href="/moderation"
          >
            Перейти к модерации →
          </Link>
        )}
      </main>
      <MobileNav />
    </>
  );
}
