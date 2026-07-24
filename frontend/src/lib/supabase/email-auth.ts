import type { User as AuthUser } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceClient, type ProfileRecord } from "./server";

const email = z
  .string()
  .trim()
  .email("Введите корректный email")
  .max(254)
  .transform((value) => value.toLowerCase());

export const emailRegistrationSchema = z.object({
  email,
  password: z
    .string()
    .min(10, "Пароль должен содержать минимум 10 символов")
    .max(72, "Пароль должен содержать не больше 72 символов")
    .refine((value) => /\p{L}/u.test(value) && /\p{N}/u.test(value), {
      message: "Добавьте в пароль хотя бы одну букву и одну цифру",
    }),
  name: z
    .string()
    .trim()
    .min(2, "Укажите имя")
    .max(80, "Имя слишком длинное"),
});

export const emailLoginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

function safeName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function splitName(value: string): { firstName: string; lastName: string } {
  const [firstName = "", ...rest] = value.split(/\s+/).filter(Boolean);
  return { firstName, lastName: rest.join(" ").slice(0, 150) };
}

export async function ensureEmailProfile(
  authUser: AuthUser,
  suppliedName?: string,
): Promise<ProfileRecord> {
  const admin = createServiceClient();
  const existing = await admin
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as ProfileRecord;

  const metadataName =
    safeName(authUser.user_metadata?.display_name) ||
    safeName(authUser.user_metadata?.full_name) ||
    safeName(authUser.user_metadata?.first_name);
  const { firstName, lastName } = splitName(
    safeName(suppliedName) || metadataName || "Игрок",
  );
  const username = `player_${authUser.id.replaceAll("-", "").slice(0, 12)}`;
  const created = await admin
    .from("profiles")
    .insert({
      auth_user_id: authUser.id,
      telegram_id: null,
      username,
      first_name: firstName,
      last_name: lastName,
      avatar_url: "",
    })
    .select("*")
    .single();
  if (!created.error) return created.data as ProfileRecord;

  // A concurrent first login may have created the profile between the read and
  // insert. Read it once more before treating the operation as failed.
  const raced = await admin
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();
  if (raced.data) return raced.data as ProfileRecord;
  throw created.error;
}
