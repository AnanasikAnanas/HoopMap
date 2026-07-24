/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Court, Game, PublicUser, User } from "@/lib/types";
import type { ProfileRecord } from "./server";

const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "hoopmap-media";
const publicStorageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${bucket}`;

export function publicUser(record: any): PublicUser | null {
  if (!record) return null;
  return {
    id: Number(record.id),
    username: record.username ?? "",
    first_name: record.first_name ?? "",
    last_name: record.last_name ?? "",
    avatar_url: record.avatar_url ?? "",
    role: record.role ?? "user",
    reputation: Number(record.reputation ?? 0),
  };
}

export function privateUser(record: ProfileRecord): User {
  return {
    ...(publicUser(record) as PublicUser),
    telegram_id: record.telegram_id,
  };
}

function storageUrl(path: string): string {
  if (!path) return "";
  return `${publicStorageBase}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function serializeCourt(record: any, distance?: number | null): Court {
  const ratings = (record.reviews ?? []).map((item: any) => Number(item.rating));
  const average =
    ratings.length > 0 ? ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length : null;
  const verifications = [...(record.verifications ?? [])].sort(
    (a: any, b: any) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const photos = (record.photos ?? []).map((photo: any) => ({
    id: Number(photo.id),
    image: storageUrl(photo.storage_path),
    thumbnail: storageUrl(photo.thumbnail_path || photo.storage_path),
    status: photo.status,
  }));
  return {
    id: Number(record.id),
    name: record.name,
    slug: record.slug,
    description: record.description ?? "",
    address: record.address,
    city: record.city,
    country: record.country,
    location: { lat: Number(record.latitude), lon: Number(record.longitude) },
    court_type: record.court_type,
    access_type: record.access_type,
    surface: record.surface,
    hoops_count: Number(record.hoops_count),
    has_lighting: Boolean(record.has_lighting),
    has_marking: Boolean(record.has_marking),
    has_nets: Boolean(record.has_nets),
    condition: record.condition,
    status: record.status,
    photos,
    average_rating: average,
    verifications_count: verifications.length,
    last_verified_at: verifications[0]?.created_at ?? null,
    verified_at: record.verified_at,
    distance_m: distance ?? null,
    is_favorite: (record.favorites ?? []).length > 0,
    created_by: publicUser(record.created_by_profile),
  };
}

export function serializeGame(record: any, court: Court): Game {
  const joined = (record.participants ?? []).filter((item: any) => item.status === "joined");
  return {
    id: Number(record.id),
    court_details: court,
    creator: publicUser(record.creator) as PublicUser,
    title: record.title,
    description: record.description ?? "",
    starts_at: record.starts_at,
    ends_at: record.ends_at,
    skill_level: record.skill_level,
    max_players: Number(record.max_players),
    status: record.status,
    players_count: joined.length,
    is_joined: joined.some((item: any) => item.mine === true),
  };
}

export const courtSelect = `
  *,
  created_by_profile:profiles!courts_created_by_fkey(
    id,username,first_name,last_name,avatar_url,role,reputation
  ),
  photos:court_photos(id,storage_path,thumbnail_path,status,uploaded_by,created_at),
  reviews:court_reviews(rating),
  verifications:court_verifications(created_at),
  favorites:favorite_courts(user_id)
`;
