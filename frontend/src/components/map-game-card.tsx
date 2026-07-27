"use client";

import Link from "next/link";
import { CalendarDays, MapPin, Users } from "lucide-react";
import type { Game } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Badge, Card } from "@/components/ui";

const skillLabels: Record<string, string> = {
  any: "Любой уровень",
  beginner: "Начинающие",
  intermediate: "Средний",
  advanced: "Продвинутые",
};

export function MapGameCard({ game }: { game: Game }) {
  const freeSpots = Math.max(game.max_players - game.players_count, 0);

  return (
    <Card className="border-0 p-4 shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-orange/10 text-orange">
          {skillLabels[game.skill_level] ?? game.skill_level}
        </Badge>
        <Badge
          className={
            freeSpots > 0
              ? "bg-success/10 text-success"
              : "bg-danger/10 text-danger"
          }
        >
          {freeSpots > 0 ? `Свободно ${freeSpots}` : "Мест нет"}
        </Badge>
      </div>
      <h2 className="mt-3 text-lg font-extrabold">{game.title}</h2>
      <div className="mt-3 grid gap-2 text-sm text-muted">
        <p className="flex items-center gap-2">
          <CalendarDays size={16} className="text-orange" />
          {formatDate(game.starts_at)}
        </p>
        <p className="flex items-center gap-2">
          <MapPin size={16} className="text-orange" />
          {game.court_details.name}
        </p>
        <p className="flex items-center gap-2">
          <Users size={16} className="text-orange" />
          Участники: {game.players_count}/{game.max_players}
        </p>
      </div>
      <Link
        href={`/games/${game.id}`}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-orange px-5 text-sm font-bold text-white transition hover:bg-[#d95822] active:scale-[0.98]"
      >
        Открыть игру
      </Link>
    </Card>
  );
}
