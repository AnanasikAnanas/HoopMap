"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clock3,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { Header, MobileNav } from "@/components/header";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Input } from "@/components/ui";
import { ApiError, gamesApi, socialApi } from "@/lib/api";
import type {
  FriendConnection,
  PublicUser,
  SocialOverview,
  SocialSearchResult,
  Team,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

function displayName(user: PublicUser): string {
  return (
    `${user.first_name} ${user.last_name}`.trim() || user.username || "Игрок"
  );
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.payload as { detail?: unknown } | null;
    if (typeof payload?.detail === "string") return payload.detail;
  }
  return "Не удалось выполнить действие";
}

function replaceOverview(
  queryClient: ReturnType<typeof useQueryClient>,
  overview: SocialOverview,
) {
  queryClient.setQueryData(["social-overview"], overview);
}

export default function CommunityPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [teamFormOpen, setTeamFormOpen] = useState(false);

  const overview = useQuery({
    queryKey: ["social-overview"],
    queryFn: socialApi.overview,
    retry: false,
  });
  const searchResults = useQuery({
    queryKey: ["social-search", submittedSearch],
    queryFn: () => socialApi.search(submittedSearch),
    enabled: submittedSearch.length >= 2,
  });

  const requestFriend = useMutation({
    mutationFn: socialApi.requestFriend,
    onSuccess: (data) => {
      replaceOverview(queryClient, data);
      void queryClient.invalidateQueries({ queryKey: ["social-search"] });
      showToast("Заявка отправлена", { tone: "success" });
    },
    onError: (error) => showToast(errorText(error), { tone: "error" }),
  });
  const respondFriend = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: number;
      action: "accept" | "decline";
    }) => socialApi.respondToFriend(id, action),
    onSuccess: (data) => {
      replaceOverview(queryClient, data);
      void queryClient.invalidateQueries({ queryKey: ["social-search"] });
    },
    onError: (error) => showToast(errorText(error), { tone: "error" }),
  });
  const removeFriend = useMutation({
    mutationFn: socialApi.removeFriend,
    onSuccess: (data) => {
      replaceOverview(queryClient, data);
      void queryClient.invalidateQueries({ queryKey: ["social-search"] });
    },
    onError: (error) => showToast(errorText(error), { tone: "error" }),
  });
  const createTeam = useMutation({
    mutationFn: socialApi.createTeam,
    onSuccess: () => {
      setTeamFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["social-overview"] });
      showToast("Команда создана", { tone: "success" });
    },
    onError: (error) => showToast(errorText(error), { tone: "error" }),
  });
  const respondTeam = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: number;
      action: "accept" | "decline";
    }) => socialApi.respondToTeam(id, action),
    onSuccess: (data) => replaceOverview(queryClient, data),
    onError: (error) => showToast(errorText(error), { tone: "error" }),
  });
  const inviteToTeam = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) =>
      socialApi.inviteToTeam(teamId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["social-overview"] });
      showToast("Приглашение в команду отправлено", { tone: "success" });
    },
    onError: (error) => showToast(errorText(error), { tone: "error" }),
  });
  const leaveTeam = useMutation({
    mutationFn: socialApi.leaveTeam,
    onSuccess: (data) => replaceOverview(queryClient, data),
    onError: (error) => showToast(errorText(error), { tone: "error" }),
  });
  const removeMember = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) =>
      socialApi.removeTeamMember(teamId, userId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["social-overview"] }),
    onError: (error) => showToast(errorText(error), { tone: "error" }),
  });
  const gameInvitation = useMutation({
    mutationFn: ({
      gameId,
      action,
    }: {
      gameId: number;
      action: "accept" | "decline";
    }) => gamesApi.respondToInvitation(gameId, action),
    onSuccess: (game, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["social-overview"] });
      void queryClient.invalidateQueries({
        queryKey: ["game", String(game.id)],
      });
      showToast(
        variables.action === "accept"
          ? "Вы присоединились к игре"
          : "Приглашение отклонено",
        { tone: "success" },
      );
    },
    onError: (error) => showToast(errorText(error), { tone: "error" }),
  });

  const data = overview.data;
  const activeTeams = data?.teams.filter((team) => team.my_status === "active");
  const invitedTeams = data?.teams.filter(
    (team) => team.my_status === "invited",
  );

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = search.trim();
    if (value.length < 2) {
      showToast("Введите минимум 2 символа", { tone: "error" });
      return;
    }
    setSubmittedSearch(value);
  };

  if (overview.isError) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="display text-3xl">Сообщество игроков</h1>
          <p className="mt-3 text-muted">
            Войдите, чтобы находить друзей и собирать команды.
          </p>
          <Link
            href="/login?next=/community"
            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-orange px-5 text-sm font-bold text-white"
          >
            Войти
          </Link>
        </main>
        <MobileNav />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
        <section className="overflow-hidden rounded-3xl bg-dark p-7 text-white md:p-10">
          <Badge className="bg-orange text-white">HOOPMAP COMMUNITY</Badge>
          <h1 className="display mt-5 text-3xl md:text-4xl">Играй со своими</h1>
          <p className="mt-3 max-w-2xl text-white/60">
            Находите знакомых игроков, собирайте постоянные команды и
            приглашайте состав на следующую игру.
          </p>
        </section>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-5">
            <Card className="p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-orange">
                    Поиск
                  </p>
                  <h2 className="display mt-1 text-xl">Найти игрока</h2>
                </div>
                <Search className="text-orange" />
              </div>
              <form className="mt-5 flex gap-2" onSubmit={submitSearch}>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Имя или username"
                  maxLength={50}
                />
                <Button type="submit" className="shrink-0 px-5">
                  Найти
                </Button>
              </form>
              {searchResults.isFetching && (
                <p className="mt-4 text-sm text-muted">Ищем игроков…</p>
              )}
              {submittedSearch &&
                !searchResults.isFetching &&
                searchResults.data?.length === 0 && (
                  <p className="mt-4 text-sm text-muted">
                    Никого не нашли. Проверьте написание.
                  </p>
                )}
              {searchResults.data && searchResults.data.length > 0 && (
                <div className="mt-4 divide-y divide-line rounded-2xl border border-line">
                  {searchResults.data.map((player) => (
                    <SearchPlayer
                      key={player.id}
                      player={player}
                      pending={requestFriend.isPending}
                      onAdd={() => requestFriend.mutate(player.id)}
                    />
                  ))}
                </div>
              )}
            </Card>

            {Boolean(data?.incoming_requests.length) && (
              <Card className="p-5 md:p-6">
                <SectionTitle
                  icon={<UserPlus />}
                  eyebrow="Новые заявки"
                  title="Хотят добавить вас"
                />
                <div className="mt-5 space-y-3">
                  {data!.incoming_requests.map((friendship) => (
                    <FriendRequest
                      key={friendship.id}
                      friendship={friendship}
                      pending={respondFriend.isPending}
                      onAccept={() =>
                        respondFriend.mutate({
                          id: friendship.id,
                          action: "accept",
                        })
                      }
                      onDecline={() =>
                        respondFriend.mutate({
                          id: friendship.id,
                          action: "decline",
                        })
                      }
                    />
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-5 md:p-6">
              <SectionTitle
                icon={<UsersRound />}
                eyebrow="Контакты"
                title={`Друзья · ${data?.friends.length ?? 0}`}
              />
              {!data?.friends.length ? (
                <p className="mt-5 rounded-2xl bg-canvas p-5 text-sm text-muted">
                  Найдите игроков по имени или добавьте тех, с кем уже играли.
                </p>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {data.friends.map((friendship) => (
                    <div
                      key={friendship.id}
                      className="flex items-center gap-3 rounded-2xl bg-canvas p-3"
                    >
                      <PlayerAvatar user={friendship.user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">
                          {displayName(friendship.user)}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {friendship.user.username
                            ? `@${friendship.user.username}`
                            : "Игрок HOOPMAP"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-full p-2 text-muted transition hover:bg-danger/10 hover:text-danger"
                        aria-label="Удалить из друзей"
                        disabled={removeFriend.isPending}
                        onClick={() => removeFriend.mutate(friendship.id)}
                      >
                        <UserMinus size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {Boolean(data?.outgoing_requests.length) && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">
                    Ожидают ответа
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data!.outgoing_requests.map((request) => (
                      <Badge key={request.id} className="gap-1.5">
                        <Clock3 size={13} />
                        {displayName(request.user)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {Boolean(data?.recent_players.length) && (
              <Card className="p-5 md:p-6">
                <SectionTitle
                  icon={<Clock3 />}
                  eyebrow="История игр"
                  title="С кем вы играли"
                />
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {data!.recent_players.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 rounded-2xl bg-canvas p-3"
                    >
                      <PlayerAvatar user={player} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">
                          {displayName(player)}
                        </p>
                        <p className="text-xs text-muted">
                          Вместе игр: {player.games_together}
                        </p>
                      </div>
                      {player.friendship_status === "none" && (
                        <button
                          type="button"
                          aria-label="Добавить в друзья"
                          className="rounded-full bg-orange/10 p-2 text-orange"
                          onClick={() => requestFriend.mutate(player.id)}
                        >
                          <UserPlus size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <aside className="space-y-5">
            {Boolean(data?.game_invitations.length) && (
              <Card className="border-orange/30 p-5">
                <SectionTitle
                  icon={<TrophyIcon />}
                  eyebrow="Игры"
                  title="Вас пригласили"
                />
                <div className="mt-5 space-y-3">
                  {data!.game_invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="rounded-2xl bg-canvas p-4"
                    >
                      <Link
                        href={`/games/${invitation.game.id}`}
                        className="font-bold hover:text-orange"
                      >
                        {invitation.game.title}
                      </Link>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        {formatDate(invitation.game.starts_at)}
                        {invitation.game.court_name
                          ? ` · ${invitation.game.court_name}`
                          : ""}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        От {displayName(invitation.inviter)}
                        {invitation.team
                          ? ` · команда «${invitation.team.name}»`
                          : ""}
                      </p>
                      <div className="mt-4 flex gap-2">
                        <Button
                          type="button"
                          className="min-h-10 flex-1 gap-1 px-3"
                          disabled={gameInvitation.isPending}
                          onClick={() =>
                            gameInvitation.mutate({
                              gameId: invitation.game.id,
                              action: "accept",
                            })
                          }
                        >
                          <Check size={16} /> Играть
                        </Button>
                        <Button
                          type="button"
                          className="min-h-10 bg-surface px-3 text-ink ring-1 ring-line"
                          disabled={gameInvitation.isPending}
                          onClick={() =>
                            gameInvitation.mutate({
                              gameId: invitation.game.id,
                              action: "decline",
                            })
                          }
                        >
                          <X size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle
                  icon={<ShieldCheck />}
                  eyebrow="Составы"
                  title="Мои команды"
                />
                <button
                  type="button"
                  className="rounded-full bg-orange/10 p-2 text-orange"
                  aria-label="Создать команду"
                  onClick={() => setTeamFormOpen((value) => !value)}
                >
                  {teamFormOpen ? <X size={19} /> : <UserPlus size={19} />}
                </button>
              </div>

              {teamFormOpen && (
                <TeamForm
                  pending={createTeam.isPending}
                  onSubmit={(values) => createTeam.mutate(values)}
                />
              )}

              {Boolean(invitedTeams?.length) && (
                <div className="mt-5 space-y-3">
                  {invitedTeams!.map((team) => (
                    <div
                      key={team.id}
                      className="rounded-2xl border border-orange/30 bg-orange/5 p-4"
                    >
                      <p className="font-bold">{team.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        Приглашение в команду
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          className="min-h-10 flex-1 px-3"
                          onClick={() =>
                            respondTeam.mutate({
                              id: team.id,
                              action: "accept",
                            })
                          }
                        >
                          Принять
                        </Button>
                        <Button
                          type="button"
                          className="min-h-10 bg-surface px-3 text-ink ring-1 ring-line"
                          onClick={() =>
                            respondTeam.mutate({
                              id: team.id,
                              action: "decline",
                            })
                          }
                        >
                          Отклонить
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!activeTeams?.length && !teamFormOpen ? (
                <p className="mt-5 rounded-2xl bg-canvas p-4 text-sm text-muted">
                  Создайте команду и пригласите друзей в постоянный состав.
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  {activeTeams?.map((team) => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      friends={data?.friends ?? []}
                      pending={
                        inviteToTeam.isPending ||
                        leaveTeam.isPending ||
                        removeMember.isPending
                      }
                      onInvite={(userId) =>
                        inviteToTeam.mutate({ teamId: team.id, userId })
                      }
                      onLeave={() => leaveTeam.mutate(team.id)}
                      onRemove={(userId) =>
                        removeMember.mutate({ teamId: team.id, userId })
                      }
                    />
                  ))}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </main>
      <MobileNav />
    </>
  );
}

function SectionTitle({
  icon,
  eyebrow,
  title,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 text-orange">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-orange">
          {eyebrow}
        </p>
        <h2 className="display mt-1 truncate text-xl">{title}</h2>
      </div>
    </div>
  );
}

function PlayerAvatar({ user }: { user: PublicUser }) {
  const name = displayName(user);
  return user.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.avatar_url}
      alt=""
      className="size-11 shrink-0 rounded-full object-cover"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange/10 font-extrabold text-orange">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function SearchPlayer({
  player,
  pending,
  onAdd,
}: {
  player: SocialSearchResult;
  pending: boolean;
  onAdd: () => void;
}) {
  const stateLabels = {
    accepted: "В друзьях",
    incoming: "Ответьте в заявках",
    outgoing: "Заявка отправлена",
  } as const;
  return (
    <div className="flex items-center gap-3 p-3">
      <PlayerAvatar user={player} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{displayName(player)}</p>
        <p className="truncate text-xs text-muted">
          {player.username ? `@${player.username}` : "Игрок HOOPMAP"}
        </p>
      </div>
      {player.friendship_status === "none" ? (
        <Button
          type="button"
          className="min-h-10 gap-1 px-3"
          disabled={pending}
          onClick={onAdd}
        >
          <UserPlus size={16} /> Добавить
        </Button>
      ) : (
        <Badge>{stateLabels[player.friendship_status]}</Badge>
      )}
    </div>
  );
}

function FriendRequest({
  friendship,
  pending,
  onAccept,
  onDecline,
}: {
  friendship: FriendConnection;
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-canvas p-3">
      <PlayerAvatar user={friendship.user} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{displayName(friendship.user)}</p>
        <p className="text-xs text-muted">Хочет добавить вас в друзья</p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          className="min-h-10 gap-1 px-3"
          disabled={pending}
          onClick={onAccept}
        >
          <Check size={16} /> Принять
        </Button>
        <Button
          type="button"
          aria-label="Отклонить"
          className="min-h-10 bg-surface px-3 text-ink ring-1 ring-line"
          disabled={pending}
          onClick={onDecline}
        >
          <X size={16} />
        </Button>
      </div>
    </div>
  );
}

function TeamForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (values: { name: string; description: string }) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
    });
  };
  return (
    <form
      className="mt-5 space-y-3 rounded-2xl bg-canvas p-4"
      onSubmit={submit}
    >
      <Input
        name="name"
        placeholder="Название команды"
        minLength={3}
        maxLength={80}
        required
      />
      <textarea
        name="description"
        rows={3}
        maxLength={500}
        placeholder="Коротко о команде"
        className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-orange"
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Создаём…" : "Создать команду"}
      </Button>
    </form>
  );
}

function TeamCard({
  team,
  friends,
  pending,
  onInvite,
  onLeave,
  onRemove,
}: {
  team: Team;
  friends: FriendConnection[];
  pending: boolean;
  onInvite: (userId: number) => void;
  onLeave: () => void;
  onRemove: (userId: number) => void;
}) {
  const [selectedFriend, setSelectedFriend] = useState("");
  const memberIds = useMemo(
    () => new Set(team.members.map((member) => member.user.id)),
    [team.members],
  );
  const availableFriends = friends.filter(
    (friend) => !memberIds.has(friend.user.id),
  );
  const canManage = ["owner", "admin"].includes(team.my_role);
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{team.name}</p>
          <p className="mt-1 text-xs text-muted">
            {team.members_count} участников ·{" "}
            {team.my_role === "owner"
              ? "владелец"
              : team.my_role === "admin"
                ? "администратор"
                : "участник"}
          </p>
        </div>
        <Badge>{team.members_count}</Badge>
      </div>
      {team.description && (
        <p className="mt-3 text-sm leading-6 text-muted">{team.description}</p>
      )}
      <div className="mt-4 space-y-2">
        {team.members
          .filter((member) => member.status === "active")
          .map((member) => (
            <div key={member.user.id} className="flex items-center gap-2">
              <PlayerAvatar user={member.user} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {displayName(member.user)}
                </p>
                <p className="text-xs text-muted">
                  {member.role === "owner"
                    ? "Владелец"
                    : member.role === "admin"
                      ? "Администратор"
                      : "Участник"}
                </p>
              </div>
              {canManage &&
                member.role !== "owner" &&
                !(team.my_role === "admin" && member.role === "admin") && (
                  <button
                    type="button"
                    className="rounded-full p-2 text-muted hover:text-danger"
                    aria-label="Удалить участника"
                    disabled={pending}
                    onClick={() => onRemove(member.user.id)}
                  >
                    <UserMinus size={16} />
                  </button>
                )}
            </div>
          ))}
      </div>
      {canManage && availableFriends.length > 0 && (
        <div className="mt-4 flex gap-2">
          <select
            value={selectedFriend}
            onChange={(event) => setSelectedFriend(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          >
            <option value="">Пригласить друга</option>
            {availableFriends.map((friend) => (
              <option key={friend.user.id} value={friend.user.id}>
                {displayName(friend.user)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            className="min-h-10 px-3"
            disabled={pending || !selectedFriend}
            onClick={() => {
              onInvite(Number(selectedFriend));
              setSelectedFriend("");
            }}
          >
            <UserPlus size={17} />
          </Button>
        </div>
      )}
      {team.my_role !== "owner" && (
        <button
          type="button"
          className="mt-4 text-xs font-bold text-danger"
          disabled={pending}
          onClick={onLeave}
        >
          Покинуть команду
        </button>
      )}
    </div>
  );
}

function TrophyIcon() {
  return (
    <span aria-hidden className="text-lg leading-none">
      🏀
    </span>
  );
}
