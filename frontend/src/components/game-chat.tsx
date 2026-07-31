"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Pin, Send, Trash2 } from "lucide-react";
import { currentAccessToken, gamesApi } from "@/lib/api";
import { subscribeToGameChat } from "@/lib/game-chat-realtime";
import type { GameChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { Button, Card } from "@/components/ui";

function authorName(message: GameChatMessage): string {
  return (
    `${message.author.first_name} ${message.author.last_name}`.trim() ||
    message.author.username ||
    "Игрок"
  );
}

function messageTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function GameChat({ gameId }: { gameId: number }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [message, setMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryKey = useMemo(() => ["game-chat", gameId], [gameId]);
  const chat = useQuery({
    queryKey,
    queryFn: () => gamesApi.messages(gameId),
    refetchInterval: 15_000,
  });
  const realtimeToken = chat.isSuccess ? currentAccessToken() : null;

  useEffect(() => {
    if (!realtimeToken) return;
    let active = true;
    let unsubscribe: (() => Promise<void>) | undefined;
    void subscribeToGameChat(gameId, realtimeToken, () => {
      void queryClient.invalidateQueries({ queryKey });
    }).then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else void cleanup();
    });
    return () => {
      active = false;
      if (unsubscribe) void unsubscribe();
    };
  }, [gameId, queryClient, queryKey, realtimeToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chat.data?.messages.length]);

  const send = useMutation({
    mutationFn: () => gamesApi.sendMessage(gameId, message),
    onSuccess: () => {
      setMessage("");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () =>
      showToast("Не удалось отправить сообщение", { tone: "error" }),
  });
  const remove = useMutation({
    mutationFn: (messageId: number) =>
      gamesApi.deleteMessage(gameId, messageId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: () => showToast("Не удалось удалить сообщение", { tone: "error" }),
  });
  const pin = useMutation({
    mutationFn: ({
      messageId,
      pinned,
    }: {
      messageId: number;
      pinned: boolean;
    }) => gamesApi.pinMessage(gameId, messageId, pinned),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey });
      showToast(
        variables.pinned ? "Сообщение закреплено" : "Закрепление снято",
        { tone: "success" },
      );
    },
    onError: () =>
      showToast("Не удалось изменить закреплённое сообщение", {
        tone: "error",
      }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim() || send.isPending) return;
    send.mutate();
  };
  const handleKeys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  if (chat.isLoading) {
    return (
      <Card className="p-5 md:p-6">
        <p className="text-sm text-muted">Открываем чат игры…</p>
      </Card>
    );
  }
  if (chat.isError || !chat.data) {
    return (
      <Card className="p-5 md:p-6">
        <p className="text-sm text-muted">
          Чат временно недоступен. Попробуйте обновить страницу.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-5 md:px-6">
        <div>
          <h2 className="display flex items-center gap-2 text-xl">
            <MessageCircle className="text-orange" size={21} />
            Чат игры
          </h2>
          <p className="mt-1 text-xs text-muted">
            Только для организатора и участников
          </p>
        </div>
        <span className="rounded-full bg-orange/10 px-3 py-1 text-xs font-bold text-orange">
          Закрытый
        </span>
      </div>

      {chat.data.pinned && !chat.data.pinned.is_deleted && (
        <div className="border-b border-orange/20 bg-orange/5 px-5 py-3 md:px-6">
          <div className="flex items-start gap-2 text-sm">
            <Pin className="mt-0.5 shrink-0 text-orange" size={15} />
            <div className="min-w-0">
              <p className="text-xs font-bold text-orange">
                Закрепил организатор
              </p>
              <p className="mt-0.5 break-words text-ink">
                {chat.data.pinned.body}
              </p>
            </div>
          </div>
        </div>
      )}

      <div
        className="max-h-[430px] min-h-64 space-y-3 overflow-y-auto bg-canvas/60 p-4 md:p-5"
        aria-live="polite"
      >
        {chat.data.messages.length === 0 ? (
          <div className="grid min-h-52 place-items-center text-center">
            <div>
              <MessageCircle className="mx-auto text-orange/50" size={32} />
              <p className="mt-3 font-bold">Начните обсуждение</p>
              <p className="mt-1 text-sm text-muted">
                Договоритесь о форме, мяче и времени встречи.
              </p>
            </div>
          </div>
        ) : (
          chat.data.messages.map((item) => {
            const name = authorName(item);
            return (
              <div
                key={item.id}
                className={cn(
                  "group flex gap-2",
                  item.is_mine && "justify-end",
                )}
              >
                {!item.is_mine && (
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-orange/10 text-xs font-extrabold text-orange">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[86%] rounded-2xl px-3.5 py-2.5 shadow-sm",
                    item.is_mine
                      ? "rounded-br-md bg-orange text-white"
                      : "rounded-bl-md border border-line bg-surface text-ink",
                    item.is_deleted && "bg-surface text-muted",
                  )}
                >
                  {!item.is_mine && (
                    <p className="mb-1 text-xs font-bold text-orange">{name}</p>
                  )}
                  <p
                    className={cn(
                      "whitespace-pre-wrap break-words text-sm leading-5",
                      item.is_deleted && "italic",
                    )}
                  >
                    {item.is_deleted ? "Сообщение удалено" : item.body}
                  </p>
                  <div
                    className={cn(
                      "mt-1.5 flex items-center justify-end gap-2 text-[10px]",
                      item.is_mine ? "text-white/70" : "text-muted",
                    )}
                  >
                    {item.is_pinned && <Pin size={10} />}
                    <span>{messageTime(item.created_at)}</span>
                    {!item.is_deleted && chat.data.can_moderate && (
                      <button
                        type="button"
                        className="rounded p-1 transition hover:bg-black/10"
                        aria-label={
                          item.is_pinned
                            ? "Открепить сообщение"
                            : "Закрепить сообщение"
                        }
                        onClick={() =>
                          pin.mutate({
                            messageId: item.id,
                            pinned: !item.is_pinned,
                          })
                        }
                        disabled={pin.isPending}
                      >
                        <Pin size={12} />
                      </button>
                    )}
                    {!item.is_deleted && item.can_delete && (
                      <button
                        type="button"
                        className="rounded p-1 transition hover:bg-black/10"
                        aria-label="Удалить сообщение"
                        onClick={() => {
                          if (window.confirm("Удалить это сообщение?")) {
                            remove.mutate(item.id);
                          }
                        }}
                        disabled={remove.isPending}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-line bg-surface p-3 md:p-4"
        onSubmit={submit}
      >
        <label className="sr-only" htmlFor={`game-message-${gameId}`}>
          Сообщение
        </label>
        <textarea
          id={`game-message-${gameId}`}
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, 1000))}
          onKeyDown={handleKeys}
          rows={1}
          maxLength={1000}
          disabled={!chat.data.can_post || send.isPending}
          placeholder={
            chat.data.can_post
              ? "Напишите сообщение…"
              : "Чат доступен только для чтения"
          }
          className="min-h-11 flex-1 resize-none rounded-2xl border border-line bg-canvas px-4 py-3 text-sm text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/15 disabled:opacity-60"
        />
        <Button
          type="submit"
          className="size-11 shrink-0 px-0"
          disabled={!chat.data.can_post || !message.trim() || send.isPending}
          aria-label="Отправить сообщение"
        >
          <Send size={18} />
        </Button>
      </form>
    </Card>
  );
}
