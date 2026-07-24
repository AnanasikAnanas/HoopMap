import type { Court, Game, Page, User } from "./types";
import { createClient } from "@supabase/supabase-js";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api/v1").replace(/\/$/, "");
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
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "hoopmap-media";
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
  join: (id: number) => api(`/games/${id}/join/`, { method: "POST" }),
  leave: (id: number) => api(`/games/${id}/leave/`, { method: "POST" }),
};

export const authApi = {
  me: () => api<User>("/auth/me/"),
  updateMapHome: (location: { lat: number; lon: number } | null) =>
    api<User>("/auth/map-home/", {
      method: "PATCH",
      body: JSON.stringify(location ? { location } : { clear: true }),
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

export async function restoreSession(): Promise<boolean> {
  return Boolean(await refreshAccessToken());
}

export async function logout(): Promise<void> {
  try {
    await requestApi<void>("/auth/logout/", { method: "POST", body: "{}" }, false);
  } finally {
    setAccessToken(null);
  }
}
