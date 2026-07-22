"use client";

import { useQuery } from "@tanstack/react-query";
import { Heart, MapPin, Trophy } from "lucide-react";
import Link from "next/link";
import { Header, MobileNav } from "@/components/header";
import { Card } from "@/components/ui";
import { authApi } from "@/lib/api";

export default function ProfilePage() {
  const { data: user, isError } = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    retry: false,
  });
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
                ? "Откройте сервис через Telegram, чтобы войти"
                : "Загружаем профиль…"}
          </p>
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
