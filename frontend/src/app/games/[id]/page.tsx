"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Pencil,
  Share2,
  UserRound,
  UserRoundPlus,
  Users,
  UsersRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BasketballLoader } from "@/components/basketball-feedback";
import { GameChat } from "@/components/game-chat";
import { Header, MobileNav } from "@/components/header";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Input } from "@/components/ui";
import { ApiError, gamesApi, socialApi } from "@/lib/api";
import { hapticNotification } from "@/lib/haptics";
import type { GameParticipant } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  scheduled: "Запланирована",
  in_progress: "Идёт сейчас",
  finished: "Завершена",
  cancelled: "Отменена",
};

const skillLabels: Record<string, string> = {
  any: "Любой уровень",
  beginner: "Начинающие",
  intermediate: "Средний",
  advanced: "Опытные",
};

function localDateTime(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.payload as { detail?: unknown } | null;
    if (typeof payload?.detail === "string") return payload.detail;
  }
  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}

function participantName(participant: GameParticipant): string {
  return (
    `${participant.first_name} ${participant.last_name}`.trim() ||
    participant.username ||
    "Игрок"
  );
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const {
    data: game,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["game", id],
    queryFn: () => gamesApi.one(id),
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)
        ?.status;
      return status === "scheduled" || status === "in_progress"
        ? 30_000
        : false;
    },
  });
  const membership = useMutation({
    mutationFn: () =>
      game!.is_joined ? gamesApi.leave(game!.id) : gamesApi.join(game!.id),
    onSuccess: (updated) => {
      qc.setQueryData(["game", id], updated);
      hapticNotification("success");
      showToast(
        game!.is_joined ? "Вы вышли из игры" : "Вы присоединились к игре",
        { tone: "success" },
      );
    },
    onError: (error) => {
      hapticNotification("error");
      showToast(errorMessage(error), { tone: "error" });
    },
  });
  const update = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      gamesApi.update(game!.id, values),
    onSuccess: (updated) => {
      qc.setQueryData(["game", id], updated);
      setEditing(false);
      hapticNotification("success");
      showToast("Изменения сохранены, участники уведомлены", {
        tone: "success",
      });
    },
  });
  const cancel = useMutation({
    mutationFn: () => gamesApi.cancel(game!.id),
    onSuccess: (updated) => {
      qc.setQueryData(["game", id], updated);
      hapticNotification("success");
      showToast("Игра отменена, участники уведомлены", { tone: "success" });
    },
    onError: (error) => showToast(errorMessage(error), { tone: "error" }),
  });

  const share = async () => {
    if (!game) return;
    const url = window.location.href;
    const text = `${game.title} · ${formatDate(game.starts_at)} · ${game.court_details.name}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: game.title, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showToast("Ссылка на игру скопирована", { tone: "success" });
      }
    } catch {
      // Closing the native share sheet is not an error for the user.
    }
  };

  const shareInTelegram = () => {
    if (!game) return;
    const url = new URL("https://t.me/share/url");
    url.searchParams.set("url", window.location.href);
    url.searchParams.set(
      "text",
      `🏀 ${game.title}\n${formatDate(game.starts_at)} · ${game.court_details.name}`,
    );
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };

  if (isLoading)
    return (
      <>
        <Header />
        <main className="grid min-h-[60dvh] place-items-center p-10">
          <BasketballLoader label="Загружаем игру" />
        </main>
      </>
    );
  if (isError || !game)
    return (
      <>
        <Header />
        <main className="p-10 text-center">Игра не найдена</main>
      </>
    );

  const freePlaces = Math.max(game.max_players - game.players_count, 0);
  const membershipLabel =
    game.status !== "scheduled"
      ? statusLabels[game.status]
      : game.is_joined
        ? "Выйти из игры"
        : freePlaces === 0
          ? "Мест нет"
          : "Присоединиться";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <div className="rounded-3xl bg-dark p-7 text-white md:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-orange text-white">
              {skillLabels[game.skill_level] ?? game.skill_level}
            </Badge>
            <Badge
              className={
                game.status === "cancelled"
                  ? "bg-danger/20 text-red-200"
                  : game.status === "in_progress"
                    ? "bg-success/20 text-green-200"
                    : "bg-white/10 text-white"
              }
            >
              {statusLabels[game.status] ?? game.status}
            </Badge>
          </div>
          <h1 className="display mt-5 text-3xl md:text-4xl">{game.title}</h1>
          <p className="mt-4 max-w-2xl text-white/60">
            {game.description ||
              "Открытая баскетбольная игра. Берите форму и воду."}
          </p>
          <div className="mt-8 grid gap-4 text-sm md:grid-cols-3">
            <span className="flex gap-2">
              <CalendarDays className="shrink-0 text-orange" />
              {formatDate(game.starts_at)}
            </span>
            <span className="flex gap-2">
              <MapPin className="shrink-0 text-orange" />
              {game.court_details.name}
            </span>
            <span className="flex gap-2">
              <Users className="shrink-0 text-orange" />
              {game.players_count}/{game.max_players} · свободно {freePlaces}
            </span>
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            <Button
              type="button"
              className="gap-2 bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20"
              onClick={share}
            >
              <Share2 size={17} /> Поделиться
            </Button>
            <Button
              type="button"
              className="gap-2 bg-[#229ED9] hover:bg-[#198bc1]"
              onClick={shareInTelegram}
            >
              Отправить в Telegram
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <Card className="p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="display text-xl">Участники</h2>
                  <p className="mt-1 text-sm text-muted">
                    {game.players_count
                      ? `${game.players_count} из ${game.max_players}`
                      : "Пока никто не присоединился"}
                  </p>
                </div>
                <Users className="text-orange" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {game.participants.map((participant) => {
                  const name = participantName(participant);
                  const organizer = participant.id === game.creator.id;
                  return (
                    <div
                      key={participant.id}
                      className="flex items-center gap-3 rounded-2xl bg-canvas p-3"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange/10 font-extrabold text-orange">
                        {name.slice(0, 1).toUpperCase() || (
                          <UserRound size={18} />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold">{name}</p>
                        <p className="text-xs text-muted">
                          {organizer ? "Организатор" : "Участник"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {(game.is_owner || game.is_joined) && <GameChat gameId={game.id} />}

            {editing && game.is_owner && (
              <GameEditor
                game={game}
                pending={update.isPending}
                error={update.error ? errorMessage(update.error) : ""}
                onClose={() => setEditing(false)}
                onSubmit={(values) => update.mutate(values)}
              />
            )}
          </div>

          <aside className="space-y-3">
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">
                Ваше участие
              </p>
              <div className="mt-4 flex items-start gap-3">
                {game.is_joined ? (
                  <CheckCircle2 className="text-success" />
                ) : (
                  <Clock3 className="text-orange" />
                )}
                <div>
                  <p className="font-bold">
                    {game.is_owner
                      ? "Вы организатор"
                      : game.is_joined
                        ? "Вы в составе"
                        : freePlaces
                          ? "Можно присоединиться"
                          : "Свободных мест нет"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Изменения игры придут в Telegram, если аккаунт подключён.
                  </p>
                </div>
              </div>
              {!game.is_owner && (
                <Button
                  className={`mt-5 w-full ${
                    game.is_joined ? "bg-surface text-ink ring-1 ring-line" : ""
                  }`}
                  onClick={() => membership.mutate()}
                  disabled={
                    membership.isPending ||
                    game.status !== "scheduled" ||
                    (!game.is_joined && !game.can_join)
                  }
                >
                  {membership.isPending ? "Обновляем…" : membershipLabel}
                </Button>
              )}
            </Card>

            {game.is_owner && game.status === "scheduled" && (
              <Card className="p-5">
                <p className="font-bold">Управление игрой</p>
                <div className="mt-4 grid gap-2">
                  <Button
                    type="button"
                    className="gap-2 bg-surface text-ink ring-1 ring-line"
                    onClick={() => setEditing((value) => !value)}
                  >
                    <Pencil size={17} />
                    {editing ? "Закрыть редактор" : "Изменить"}
                  </Button>
                  <Button
                    type="button"
                    className="gap-2 bg-danger"
                    disabled={cancel.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Отменить игру? Все участники с подключённым Telegram получат уведомление.",
                        )
                      ) {
                        cancel.mutate();
                      }
                    }}
                  >
                    <XCircle size={17} />
                    {cancel.isPending ? "Отменяем…" : "Отменить игру"}
                  </Button>
                </div>
              </Card>
            )}

            {game.is_owner && game.status === "scheduled" && (
              <GameInvitePanel
                gameId={game.id}
                participantIds={game.participants.map(
                  (participant) => participant.id,
                )}
              />
            )}

            <a
              className="block rounded-2xl bg-canvas p-4 text-center text-sm font-bold text-orange transition hover:bg-orange/10"
              href={`/courts/${game.court_details.slug}`}
            >
              Открыть площадку
            </a>
          </aside>
        </div>
      </main>
      <MobileNav />
    </>
  );
}

function GameInvitePanel({
  gameId,
  participantIds,
}: {
  gameId: number;
  participantIds: number[];
}) {
  const { showToast } = useToast();
  const [selection, setSelection] = useState("");
  const overview = useQuery({
    queryKey: ["social-overview"],
    queryFn: socialApi.overview,
  });
  const invite = useMutation({
    mutationFn: () => {
      const [kind, rawId] = selection.split(":");
      const id = Number(rawId);
      if (kind === "team") return gamesApi.invite(gameId, { team_id: id });
      return gamesApi.invite(gameId, { user_ids: [id] });
    },
    onSuccess: ({ invited }) => {
      setSelection("");
      showToast(
        invited === 1
          ? "Приглашение отправлено"
          : `Отправлено приглашений: ${invited}`,
        { tone: "success" },
      );
    },
    onError: (error) => showToast(errorMessage(error), { tone: "error" }),
  });
  const joined = new Set(participantIds);
  const friends = (overview.data?.friends ?? []).filter(
    (friend) => !joined.has(friend.user.id),
  );
  const teams = (overview.data?.teams ?? []).filter(
    (team) => team.my_status === "active",
  );

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <UserRoundPlus className="mt-0.5 shrink-0 text-orange" />
        <div>
          <p className="font-bold">Пригласить игроков</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Выберите друга или отправьте приглашение всему составу команды.
          </p>
        </div>
      </div>
      {overview.isLoading ? (
        <p className="mt-4 text-xs text-muted">Загружаем контакты…</p>
      ) : friends.length || teams.length ? (
        <div className="mt-4 grid gap-2">
          <select
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          >
            <option value="">Кого пригласить</option>
            {friends.map((friend) => (
              <option
                key={`friend-${friend.user.id}`}
                value={`friend:${friend.user.id}`}
              >
                {participantName({
                  ...friend.user,
                  joined_at: "",
                })}
              </option>
            ))}
            {teams.map((team) => (
              <option key={`team-${team.id}`} value={`team:${team.id}`}>
                Команда «{team.name}» · {team.members_count}
              </option>
            ))}
          </select>
          <Button
            type="button"
            className="w-full gap-2"
            disabled={!selection || invite.isPending}
            onClick={() => invite.mutate()}
          >
            {selection.startsWith("team:") ? (
              <UsersRound size={17} />
            ) : (
              <UserRoundPlus size={17} />
            )}
            {invite.isPending ? "Отправляем…" : "Отправить приглашение"}
          </Button>
        </div>
      ) : (
        <Link
          href="/community"
          className="mt-4 block rounded-xl bg-canvas p-3 text-center text-xs font-bold text-orange"
        >
          Сначала добавьте друзей или создайте команду
        </Link>
      )}
    </Card>
  );
}

function GameEditor({
  game,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  game: {
    title: string;
    description: string;
    starts_at: string;
    ends_at: string;
    skill_level: string;
    max_players: number;
  };
  pending: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      starts_at: new Date(String(data.get("starts_at") ?? "")).toISOString(),
      ends_at: new Date(String(data.get("ends_at") ?? "")).toISOString(),
      skill_level: String(data.get("skill_level") ?? "any"),
      max_players: Number(data.get("max_players")),
    });
  };
  return (
    <Card className="p-5 md:p-6">
      <h2 className="display text-xl">Изменить игру</h2>
      <p className="mt-1 text-sm text-muted">
        После сохранения участники с подключённым Telegram получат уведомление.
      </p>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <Field label="Название">
          <Input
            name="title"
            defaultValue={game.title}
            minLength={3}
            maxLength={180}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Начало">
            <Input
              name="starts_at"
              type="datetime-local"
              defaultValue={localDateTime(game.starts_at)}
              required
            />
          </Field>
          <Field label="Окончание">
            <Input
              name="ends_at"
              type="datetime-local"
              defaultValue={localDateTime(game.ends_at)}
              required
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Уровень">
            <select
              name="skill_level"
              defaultValue={game.skill_level}
              className="h-12 w-full rounded-xl border border-line bg-surface px-3 text-ink"
            >
              <option value="any">Любой</option>
              <option value="beginner">Начинающие</option>
              <option value="intermediate">Средний</option>
              <option value="advanced">Опытные</option>
            </select>
          </Field>
          <Field label="Максимум игроков">
            <Input
              name="max_players"
              type="number"
              defaultValue={game.max_players}
              min={2}
              max={100}
              required
            />
          </Field>
        </div>
        <Field label="Описание">
          <textarea
            name="description"
            defaultValue={game.description}
            rows={4}
            maxLength={3000}
            className="w-full rounded-xl border border-line bg-surface p-4 text-ink"
          />
        </Field>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
          <Button
            type="button"
            className="bg-canvas text-ink ring-1 ring-line"
            onClick={onClose}
          >
            Отмена
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold">
      {label}
      {children}
    </label>
  );
}
