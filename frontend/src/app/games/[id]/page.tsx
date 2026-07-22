"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { Header, MobileNav } from "@/components/header";
import { Button, Card } from "@/components/ui";
import { gamesApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: game, isLoading } = useQuery({
    queryKey: ["game", id],
    queryFn: () => gamesApi.one(id),
  });
  const membership = useMutation({
    mutationFn: () =>
      game!.is_joined ? gamesApi.leave(game!.id) : gamesApi.join(game!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["game", id] }),
  });
  if (isLoading)
    return (
      <>
        <Header />
        <main className="p-10 text-center">Загружаем игру…</main>
      </>
    );
  if (!game)
    return (
      <>
        <Header />
        <main className="p-10 text-center">Игра не найдена</main>
      </>
    );
  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-10 pb-24">
        <div className="rounded-3xl bg-dark p-7 text-white md:p-10">
          <span className="rounded-full bg-orange px-3 py-1 text-xs font-bold">
            {game.skill_level}
          </span>
          <h1 className="display mt-5 text-3xl md:text-4xl">{game.title}</h1>
          <p className="mt-4 max-w-2xl text-white/60">
            {game.description ||
              "Открытая баскетбольная игра. Берите форму и воду."}
          </p>
          <div className="mt-8 grid gap-3 text-sm md:grid-cols-3">
            <span className="flex gap-2">
              <CalendarDays />
              {formatDate(game.starts_at)}
            </span>
            <span className="flex gap-2">
              <MapPin />
              {game.court_details.name}
            </span>
            <span className="flex gap-2">
              <Users />
              {game.players_count}/{game.max_players}
            </span>
          </div>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-[1fr_280px]">
          <Card className="p-6">
            <h2 className="font-bold">Участники</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-canvas p-3">
                <p className="font-bold">
                  {game.creator.first_name || game.creator.username}
                </p>
                <p className="text-xs text-muted">Организатор</p>
              </div>
            </div>
          </Card>
          <div>
            <Button
              className={`w-full ${game.is_joined ? "bg-white text-ink ring-1 ring-line" : ""}`}
              onClick={() => membership.mutate()}
              disabled={membership.isPending}
            >
              {game.is_joined ? "Выйти из игры" : "Присоединиться"}
            </Button>
            <a
              className="mt-3 block text-center text-sm font-bold text-orange"
              href={`/courts/${game.court_details.slug}`}
            >
              О площадке
            </a>
          </div>
        </div>
      </main>
      <MobileNav />
    </>
  );
}
