"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  LoaderCircle,
  MapPin,
  Users,
} from "lucide-react";
import type { Game } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Badge, Button, Card } from "@/components/ui";

const skillLabels: Record<string, string> = {
  any: "Любой уровень",
  beginner: "Начинающие",
  intermediate: "Средний",
  advanced: "Продвинутые",
};

export function MapGameCard({
  game,
  onJoin,
  joining = false,
  checkingAuth = false,
}: {
  game: Game;
  onJoin: () => void;
  joining?: boolean;
  checkingAuth?: boolean;
}) {
  const freeSpots = Math.max(game.max_players - game.players_count, 0);
  const canJoin =
    game.can_join &&
    game.status === "scheduled" &&
    freeSpots > 0 &&
    !game.is_joined;

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
      <Button
        type="button"
        onClick={onJoin}
        disabled={!canJoin || joining || checkingAuth}
        className={`mt-4 w-full gap-2 disabled:opacity-100 ${
          game.is_joined
            ? "bg-success"
            : freeSpots === 0
              ? "bg-canvas text-muted ring-1 ring-line"
              : ""
        }`}
      >
        {joining || checkingAuth ? (
          <LoaderCircle size={17} className="animate-spin" />
        ) : game.is_joined ? (
          <Check size={17} />
        ) : null}
        {game.status === "cancelled"
          ? "Игра отменена"
          : game.status === "in_progress"
            ? "Игра уже идёт"
            : game.status === "finished"
              ? "Игра завершена"
              : checkingAuth
          ? "Проверяем вход…"
          : joining
            ? "Присоединяем…"
            : game.is_joined
              ? "Вы участвуете"
              : freeSpots === 0
                ? "Мест нет"
                : "Присоединиться"}
      </Button>
      <Link
        href={`/games/${game.id}`}
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1 text-sm font-bold text-muted transition hover:text-orange"
      >
        Подробнее
        <ArrowRight size={15} />
      </Link>
    </Card>
  );
}
