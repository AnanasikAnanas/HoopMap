"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Plus, Users } from "lucide-react";
import Link from "next/link";
import { Header, MobileNav } from "@/components/header";
import { Card } from "@/components/ui";
import { gamesApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  scheduled: "Запланирована",
  in_progress: "Идёт сейчас",
  finished: "Завершена",
  cancelled: "Отменена",
};

export default function GamesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["games"],
    queryFn: () => gamesApi.list("status=scheduled"),
  });
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10 pb-24">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-orange">
              Выходи на площадку
            </p>
            <h1 className="display mt-2 text-3xl">Открытые игры</h1>
          </div>
          <Link
            href="/games/create"
            className="flex h-12 items-center gap-2 rounded-full bg-orange px-5 font-bold text-white"
          >
            <Plus />
            Создать
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <p>Загружаем игры…</p>
          ) : (
            data?.results.map((game) => (
              <Link key={game.id} href={`/games/${game.id}`}>
                <Card className="h-full p-5 hover:shadow-lg">
                  <div className="flex justify-between">
                    <span className="rounded-full bg-orange/10 px-3 py-1 text-xs font-bold text-orange">
                      {game.skill_level}
                    </span>
                    <span className="text-sm text-muted">
                      {statusLabels[game.status] ?? game.status}
                    </span>
                  </div>
                  <h2 className="mt-5 text-xl font-bold">{game.title}</h2>
                  <p className="mt-2 text-sm text-muted">
                    {game.court_details.name}
                  </p>
                  <div className="mt-6 flex justify-between border-t border-line pt-4 text-sm">
                    <span className="flex gap-2">
                      <CalendarDays size={17} />
                      {formatDate(game.starts_at)}
                    </span>
                    <span className="flex gap-2">
                      <Users size={17} />
                      {game.players_count}/{game.max_players}
                    </span>
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>
      </main>
      <MobileNav />
    </>
  );
}
