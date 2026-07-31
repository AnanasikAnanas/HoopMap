import type {
  Court,
  Game,
  GameChat,
  GameChatMessage,
  NotificationSettings,
  Page,
  PushSubscriptionInput,
  SocialOverview,
  SocialSearchResult,
  Team,
  User,
} from "./types";
import { createClient } from "@supabase/supabase-js";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api/v1").replace(
  /\/$/,
  "",
);
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    public payload: unknown,
  ) {
    super(`API request failed: ${status}`);
  }
}

function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function currentAccessToken(): string | null {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const response = await fetch(`${API_URL}/auth/refresh/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      setAccessToken(null);
      return null;
    }
    const result = (await response.json()) as { access: string };
    setAccessToken(result.access);
    return result.access;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function requestApi<T>(
  path: string,
  init: RequestInit,
  retryAfterRefresh: boolean,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 401 && retryAfterRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return requestApi<T>(path, init, false);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestApi<T>(path, init, true);
}

export const courtsApi = {
  list: (query: string) => api<Page<Court>>(`/courts/?${query}`),
  one: (slugOrId: string) => api<Court>(`/courts/${slugOrId}/`),
  nearby: (lat: number, lon: number, radius = 5000) =>
    api<Page<Court>>(`/courts/nearby/?lat=${lat}&lon=${lon}&radius=${radius}`),
  create: (body: Record<string, unknown>) =>
    api<Court>("/courts/", { method: "POST", body: JSON.stringify(body) }),
  uploadPhoto: async (id: number, image: File) => {
    const prepared = await api<{ path: string; token: string }>(
      `/courts/${id}/photos/`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "prepare",
          filename: image.name,
          content_type: image.type,
          size: image.size,
        }),
      },
    );
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error("Supabase is not configured");
    const bucket =
      process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "hoopmap-media";
    const supabase = createClient(supabaseUrl, anonKey);
    const uploaded = await supabase.storage
      .from(bucket)
      .uploadToSignedUrl(prepared.path, prepared.token, image, {
        contentType: image.type,
        upsert: false,
      });
    if (uploaded.error) throw uploaded.error;
    return api(`/courts/${id}/photos/`, {
      method: "POST",
      body: JSON.stringify({ action: "complete", path: prepared.path }),
    });
  },
  favorite: (id: number, active: boolean) =>
    api(`/courts/${id}/favorite/`, { method: active ? "POST" : "DELETE" }),
  verify: (id: number) =>
    api(`/courts/${id}/verify/`, {
      method: "POST",
      body: JSON.stringify({ is_confirmed: true }),
    }),
};

export const gamesApi = {
  list: (query = "") => api<Page<Game>>(`/games/?${query}`),
  one: (id: string) => api<Game>(`/games/${id}/`),
  create: (body: Record<string, unknown>) =>
    api<Game>("/games/", { method: "POST", body: JSON.stringify(body) }),
  update: (id: number, body: Record<string, unknown>) =>
    api<Game>(`/games/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  cancel: (id: number) =>
    api<Game>(`/games/${id}/cancel/`, {
      method: "POST",
      body: "{}",
    }),
  join: (id: number) => api<Game>(`/games/${id}/join/`, { method: "POST" }),
  leave: (id: number) => api<Game>(`/games/${id}/leave/`, { method: "POST" }),
  invite: (id: number, input: { user_ids?: number[]; team_id?: number }) =>
    api<{ invited: number }>(`/games/${id}/invite/`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  respondToInvitation: (id: number, action: "accept" | "decline") =>
    api<Game>(`/games/${id}/invite-response/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  messages: (id: number) => api<GameChat>(`/games/${id}/messages/`),
  sendMessage: (id: number, message: string) =>
    api<GameChatMessage>(`/games/${id}/messages/`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  deleteMessage: (id: number, messageId: number) =>
    api<GameChatMessage>(`/games/${id}/messages/`, {
      method: "DELETE",
      body: JSON.stringify({ message_id: messageId }),
    }),
  pinMessage: (id: number, messageId: number, pinned: boolean) =>
    api<GameChatMessage>(`/games/${id}/messages/`, {
      method: "PATCH",
      body: JSON.stringify({ message_id: messageId, pinned }),
    }),
};

export const socialApi = {
  overview: () => api<SocialOverview>("/social/overview/"),
  search: (query: string) =>
    api<SocialSearchResult[]>(`/social/search/?q=${encodeURIComponent(query)}`),
  requestFriend: (userId: number) =>
    api<SocialOverview>("/friends/requests/", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }),
  respondToFriend: (friendshipId: number, action: "accept" | "decline") =>
    api<SocialOverview>(`/friends/${friendshipId}/${action}/`, {
      method: "POST",
      body: "{}",
    }),
  removeFriend: (friendshipId: number) =>
    api<SocialOverview>(`/friends/${friendshipId}/`, { method: "DELETE" }),
  createTeam: (input: { name: string; description: string }) =>
    api<Team>("/teams/", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  oneTeam: (teamId: number) => api<Team>(`/teams/${teamId}/`),
  inviteToTeam: (teamId: number, userId: number) =>
    api<Team>(`/teams/${teamId}/invite/`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }),
  respondToTeam: (teamId: number, action: "accept" | "decline") =>
    api<SocialOverview>(`/teams/${teamId}/${action}/`, {
      method: "POST",
      body: "{}",
    }),
  leaveTeam: (teamId: number) =>
    api<SocialOverview>(`/teams/${teamId}/leave/`, {
      method: "POST",
      body: "{}",
    }),
  removeTeamMember: (teamId: number, userId: number) =>
    api<Team>(`/teams/${teamId}/members/`, {
      method: "DELETE",
      body: JSON.stringify({ user_id: userId }),
    }),
};

export const notificationsApi = {
  settings: () => api<NotificationSettings>("/notifications/settings/"),
  subscribe: (subscription: PushSubscriptionInput) =>
    api<NotificationSettings>("/notifications/subscribe/", {
      method: "POST",
      body: JSON.stringify(subscription),
    }),
  unsubscribe: (endpoint: string) =>
    api<NotificationSettings>("/notifications/subscribe/", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    }),
  update: (
    preferences: Partial<
      Pick<
        NotificationSettings,
        "game_updates" | "game_reminders" | "reminder_24h" | "reminder_2h"
      >
    >,
  ) =>
    api<NotificationSettings>("/notifications/settings/", {
      method: "PATCH",
      body: JSON.stringify(preferences),
    }),
  test: () =>
    api<{ delivered: number }>("/notifications/test/", {
      method: "POST",
      body: "{}",
    }),
};

export const authApi = {
  me: () => api<User>("/auth/me/"),
  createTelegramLink: () =>
    api<{ url: string; expires_at: string }>("/auth/telegram-link/", {
      method: "POST",
      body: "{}",
    }),
  updateMapHome: (location: { lat: number; lon: number } | null) =>
    api<User>("/auth/map-home/", {
      method: "PATCH",
      body: JSON.stringify(location ? { location } : { clear: true }),
    }),
  requestPasswordReset: (email: string) =>
    api<{ message: string }>("/auth/password/reset/", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  updatePassword: (password: string) =>
    api<void>("/auth/password/update/", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
};

export async function telegramLogin(initData: string): Promise<User> {
  const result = await requestApi<{ access: string; user: User }>(
    "/auth/telegram/",
    {
      method: "POST",
      body: JSON.stringify({ init_data: initData }),
    },
    false,
  );
  setAccessToken(result.access);
  return result.user;
}

export type EmailRegistrationResult =
  | { requires_confirmation: true; message: string }
  | { requires_confirmation: false; access: string; user: User };

export async function emailRegister(input: {
  email: string;
  password: string;
  name: string;
}): Promise<EmailRegistrationResult> {
  const result = await requestApi<EmailRegistrationResult>(
    "/auth/email/register/",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    false,
  );
  if (!result.requires_confirmation) setAccessToken(result.access);
  return result;
}

export async function emailLogin(input: {
  email: string;
  password: string;
}): Promise<User> {
  const result = await requestApi<{
    requires_confirmation: false;
    access: string;
    user: User;
  }>(
    "/auth/email/login/",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    false,
  );
  setAccessToken(result.access);
  return result.user;
}

export async function restoreSession(): Promise<boolean> {
  return Boolean(await refreshAccessToken());
}

export async function logout(): Promise<void> {
  try {
    await requestApi<void>(
      "/auth/logout/",
      { method: "POST", body: "{}" },
      false,
    );
  } finally {
    setAccessToken(null);
  }
}
