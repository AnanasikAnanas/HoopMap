import { createClient, type SupabaseClient, type User as AuthUser } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export type ProfileRecord = {
  id: number;
  auth_user_id: string;
  telegram_id: number | null;
  username: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
  role: "user" | "moderator" | "admin";
  reputation: number;
  created_at: string;
  updated_at: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function createServiceClient(): SupabaseClient {
  return createClient(supabaseUrl(), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createRequestClient(accessToken?: string): SupabaseClient {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

export function bearerToken(request: NextRequest): string | null {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() || null : null;
}

export type RequestIdentity = {
  accessToken: string;
  authUser: AuthUser;
  profile: ProfileRecord;
  client: SupabaseClient;
};

export async function getIdentity(request: NextRequest): Promise<RequestIdentity | null> {
  const accessToken = bearerToken(request);
  if (!accessToken) return null;
  const client = createRequestClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  const profileResult = await createServiceClient()
    .from("profiles")
    .select("*")
    .eq("auth_user_id", data.user.id)
    .single();
  if (profileResult.error || !profileResult.data) return null;
  return {
    accessToken,
    authUser: data.user,
    profile: profileResult.data as ProfileRecord,
    client,
  };
}

export function isModerator(profile: ProfileRecord): boolean {
  return profile.role === "moderator" || profile.role === "admin";
}

export function refreshCookieName(): string {
  return process.env.AUTH_REFRESH_COOKIE_NAME?.trim() || "hoopmap_refresh";
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/v1/auth",
    maxAge: 60 * 60 * 24 * 30,
  };
}
