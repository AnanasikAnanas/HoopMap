/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import {
  bearerToken,
  createRequestClient,
  createServiceClient,
  getIdentity,
  isModerator,
  refreshCookieName,
  refreshCookieOptions,
  type RequestIdentity,
} from "@/lib/supabase/server";
import {
  createTelegramSession,
  ensureTelegramUser,
  validateTelegramInitData,
} from "@/lib/supabase/telegram-auth";
import {
  emailLoginSchema,
  emailRegistrationSchema,
  ensureEmailProfile,
} from "@/lib/supabase/email-auth";
import {
  createTelegramOidcAttempt,
  exchangeTelegramCode,
  telegramLoginConfig,
  validateTelegramIdToken,
} from "@/lib/supabase/telegram-oidc";
import {
  courtSelect,
  privateUser,
  publicUser,
  serializeCourt,
  serializeGame,
} from "@/lib/supabase/serializers";
import { approximateMapLocation } from "@/lib/location-privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path?: string[] }> };
type DatabaseClient = ReturnType<typeof createRequestClient>;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function empty(status = 204): NextResponse {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}

async function body(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new HttpError(415, "Ожидается JSON");
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }
}

async function identity(request: NextRequest, required = false): Promise<RequestIdentity | null> {
  const result = await getIdentity(request);
  if (!result && (required || bearerToken(request))) throw new HttpError(401, "Требуется авторизация");
  return result;
}

async function clientFor(request: NextRequest) {
  const current = await identity(request);
  return { current, client: current?.client ?? createRequestClient() };
}

async function rateLimit(
  request: NextRequest,
  scope: string,
  maximumRequests: number,
  windowSeconds: number,
  profileId?: number,
) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const secret =
    process.env.RATE_LIMIT_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "development-only";
  const subject = profileId ? `user:${profileId}` : `ip:${forwarded}`;
  const digest = createHmac("sha256", secret).update(subject).digest("hex").slice(0, 32);
  const result = await createServiceClient().rpc("consume_rate_limit", {
    target_key: `${scope}:${digest}`,
    maximum_requests: maximumRequests,
    window_seconds: windowSeconds,
  });
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(429, "Слишком много запросов. Попробуйте позже.");
}

function positiveInt(value: string | undefined, field = "id"): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new HttpError(400, `Некорректный ${field}`);
  return result;
}

function pageParams(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") || 20) || 20));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

function pageResponse<T>(url: URL, results: T[], count: number) {
  const { page, pageSize } = pageParams(url);
  const base = new URL(url);
  const link = (target: number) => {
    base.searchParams.set("page", String(target));
    return base.pathname + base.search;
  };
  return {
    count,
    next: page * pageSize < count ? link(page + 1) : null,
    previous: page > 1 ? link(page - 1) : null,
    results,
  };
}

async function courtRecords(client: DatabaseClient, ids?: number[]) {
  let query = client.from("courts").select(courtSelect);
  if (ids) {
    if (!ids.length) return [];
    query = query.in("id", ids);
  }
  const result = await query;
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function oneCourt(client: DatabaseClient, lookup: string) {
  const numeric = /^\d+$/.test(lookup);
  let query = client.from("courts").select(courtSelect);
  query = numeric ? query.eq("id", Number(lookup)) : query.eq("slug", lookup);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(404, "Площадка не найдена");
  return result.data;
}

async function listCourts(request: NextRequest) {
  const { current, client } = await clientFor(request);
  const url = request.nextUrl;
  const { from, to } = pageParams(url);
  const favoriteOnly = url.searchParams.get("favorite") === "true";
  const mineOnly = url.searchParams.get("mine") === "true";
  if ((favoriteOnly || mineOnly) && !current) throw new HttpError(401, "Требуется авторизация");

  let favoriteIds: number[] | null = null;
  if (favoriteOnly) {
    const favorites = await client
      .from("favorite_courts")
      .select("court_id")
      .eq("user_id", current!.profile.id);
    if (favorites.error) throw favorites.error;
    favoriteIds = (favorites.data ?? []).map((item) => Number(item.court_id));
    if (!favoriteIds.length) return json(pageResponse(url, [], 0));
  }

  let query = client.from("courts").select(courtSelect, { count: "exact" });
  const equalityFilters = [
    "city",
    "country",
    "surface",
    "condition",
    "access_type",
    "court_type",
    "status",
  ] as const;
  for (const field of equalityFilters) {
    const value = url.searchParams.get(field);
    if (value) query = query.eq(field, value);
  }
  for (const field of ["has_lighting", "has_nets"] as const) {
    const value = url.searchParams.get(field);
    if (value === "true" || value === "false") query = query.eq(field, value === "true");
  }
  const hoops = url.searchParams.get("hoops_count");
  const minHoops = url.searchParams.get("hoops_count_min");
  if (hoops) query = query.eq("hoops_count", positiveInt(hoops, "hoops_count"));
  if (minHoops) query = query.gte("hoops_count", positiveInt(minHoops, "hoops_count_min"));
  if (mineOnly) query = query.eq("created_by", current!.profile.id);
  if (favoriteIds) query = query.in("id", favoriteIds);

  const bbox = url.searchParams.get("bbox");
  if (bbox) {
    const values = bbox.split(",").map(Number);
    if (
      values.length !== 4 ||
      values.some((value) => !Number.isFinite(value)) ||
      values[0] >= values[2] ||
      values[1] >= values[3]
    ) {
      throw new HttpError(400, "bbox должен быть min_lon,min_lat,max_lon,max_lat");
    }
    query = query
      .gte("longitude", values[0])
      .gte("latitude", values[1])
      .lte("longitude", values[2])
      .lte("latitude", values[3]);
  }

  const result = await query.order("created_at", { ascending: false }).range(from, to);
  if (result.error) throw result.error;
  const courts = (result.data ?? []).map((record) => serializeCourt(record));
  return json(pageResponse(url, courts, result.count ?? courts.length));
}

async function nearbyCourts(request: NextRequest) {
  const { client } = await clientFor(request);
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  const radius = Number(request.nextUrl.searchParams.get("radius") || 5000);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isInteger(radius)) {
    throw new HttpError(400, "Передайте корректные lat, lon и radius");
  }
  const nearby = await client.rpc("nearby_courts", { lat, lon, radius_m: radius });
  if (nearby.error) throw nearby.error;
  const rows = (nearby.data ?? []) as Array<{ court_id: number; distance_m: number }>;
  const records = await courtRecords(client, rows.map((item) => Number(item.court_id)));
  const byId = new Map(records.map((record: any) => [Number(record.id), record]));
  const all = rows
    .filter((item) => byId.has(Number(item.court_id)))
    .map((item) => serializeCourt(byId.get(Number(item.court_id)), Number(item.distance_m)));
  const { from, to } = pageParams(request.nextUrl);
  return json(pageResponse(request.nextUrl, all.slice(from, to + 1), all.length));
}

const courtInput = z.object({
  name: z.string().trim().min(3).max(180),
  description: z.string().max(3000).default(""),
  address: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(120),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  court_type: z.enum(["full", "half", "single_hoop", "indoor", "outdoor"]),
  access_type: z.enum(["free", "restricted", "paid", "private"]).default("free"),
  surface: z.enum(["asphalt", "rubber", "concrete", "parquet", "other"]).default("other"),
  hoops_count: z.number().int().min(1).max(20),
  has_lighting: z.boolean().default(false),
  has_marking: z.boolean().default(true),
  has_nets: z.boolean().default(false),
  condition: z.enum(["excellent", "good", "fair", "poor", "unknown"]).default("unknown"),
});

function slugify(value: string): string {
  const base = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `${base || "court"}-${crypto.randomUUID().slice(0, 8)}`;
}

async function createCourt(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(request, "court-create", 10, 3600, current!.profile.id);
  const parsed = courtInput.safeParse(await body(request));
  if (!parsed.success) throw new HttpError(400, "Проверьте поля площадки", parsed.error.flatten());
  const value = parsed.data;
  const inserted = await current!.client
    .from("courts")
    .insert({
      name: value.name,
      slug: slugify(value.name),
      description: value.description,
      address: value.address,
      city: value.city,
      country: value.country,
      latitude: value.location.lat,
      longitude: value.location.lon,
      court_type: value.court_type,
      access_type: value.access_type,
      surface: value.surface,
      hoops_count: value.hoops_count,
      has_lighting: value.has_lighting,
      has_marking: value.has_marking,
      has_nets: value.has_nets,
      condition: value.condition,
      status: "pending",
      source: "",
      source_id: "",
      created_by: current!.profile.id,
    })
    .select("id,slug")
    .single();
  if (inserted.error) throw inserted.error;
  return json(serializeCourt(await oneCourt(current!.client, String(inserted.data.id))), 201);
}

const importCourtInput = z.object({
  external_id: z.string().trim().max(200).optional(),
  name: z.string().trim().min(3).max(180),
  description: z.string().trim().max(3000).default(""),
  address: z.string().trim().max(300).default(""),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const importCourtsInput = z.object({
  rights_confirmed: z.literal(true),
  city: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(120).default("Россия"),
  court_type: z
    .enum(["full", "half", "single_hoop", "indoor", "outdoor"])
    .default("outdoor"),
  access_type: z
    .enum(["free", "restricted", "paid", "private"])
    .default("free"),
  surface: z
    .enum(["asphalt", "rubber", "concrete", "parquet", "other"])
    .default("other"),
  hoops_count: z.number().int().min(1).max(20).default(2),
  courts: z.array(importCourtInput).min(1).max(200),
});

function distanceMeters(
  first: { lat: number; lon: number },
  second: { lat: number; lon: number },
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const deltaLat = radians(second.lat - first.lat);
  const deltaLon = radians(second.lon - first.lon);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(first.lat)) *
      Math.cos(radians(second.lat)) *
      Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(value));
}

function importSourceId(
  court: z.infer<typeof importCourtInput>,
  city: string,
): string {
  const stable = [
    court.external_id || "",
    court.name.toLocaleLowerCase("ru-RU").replace(/\s+/g, " "),
    city.toLocaleLowerCase("ru-RU"),
    court.lat.toFixed(6),
    court.lon.toFixed(6),
  ].join("|");
  return createHash("sha256").update(stable).digest("hex").slice(0, 40);
}

async function importCourts(request: NextRequest) {
  const current = await identity(request, true);
  if (!isModerator(current!.profile)) throw new HttpError(403, "Недостаточно прав");
  await rateLimit(request, "court-import", 5, 3600, current!.profile.id);
  const parsed = importCourtsInput.safeParse(await body(request));
  if (!parsed.success) {
    throw new HttpError(
      400,
      "Проверьте параметры импорта",
      parsed.error.flatten(),
    );
  }
  const value = parsed.data;
  const prepared = value.courts.map((court) => ({
    ...court,
    sourceId: importSourceId(court, value.city),
  }));
  const sourceIds = Array.from(new Set(prepared.map((court) => court.sourceId)));
  const existingBySource = await current!.client
    .from("courts")
    .select("source_id")
    .eq("source", "yandex_constructor")
    .in("source_id", sourceIds);
  if (existingBySource.error) throw existingBySource.error;
  const knownSourceIds = new Set(
    (existingBySource.data ?? []).map((court) => String(court.source_id)),
  );

  const latitudes = prepared.map((court) => court.lat);
  const longitudes = prepared.map((court) => court.lon);
  const coordinatePadding = 0.001;
  const nearby = await current!.client
    .from("courts")
    .select("id,latitude,longitude")
    .gte("latitude", Math.min(...latitudes) - coordinatePadding)
    .lte("latitude", Math.max(...latitudes) + coordinatePadding)
    .gte("longitude", Math.min(...longitudes) - coordinatePadding)
    .lte("longitude", Math.max(...longitudes) + coordinatePadding)
    .limit(5000);
  if (nearby.error) throw nearby.error;
  const occupied = (nearby.data ?? []).map((court) => ({
    lat: Number(court.latitude),
    lon: Number(court.longitude),
  }));

  let duplicateSource = 0;
  let duplicateLocation = 0;
  const rows: Record<string, unknown>[] = [];
  for (const court of prepared) {
    if (knownSourceIds.has(court.sourceId)) {
      duplicateSource += 1;
      continue;
    }
    if (
      occupied.some(
        (candidate) =>
          distanceMeters(candidate, { lat: court.lat, lon: court.lon }) <= 50,
      )
    ) {
      duplicateLocation += 1;
      continue;
    }
    occupied.push({ lat: court.lat, lon: court.lon });
    knownSourceIds.add(court.sourceId);
    rows.push({
      name: court.name,
      slug: slugify(court.name),
      description: court.description,
      address:
        court.address ||
        `Координаты ${court.lat.toFixed(6)}, ${court.lon.toFixed(6)}`,
      city: value.city,
      country: value.country,
      latitude: court.lat,
      longitude: court.lon,
      court_type: value.court_type,
      access_type: value.access_type,
      surface: value.surface,
      hoops_count: value.hoops_count,
      has_lighting: false,
      has_marking: true,
      has_nets: false,
      condition: "unknown",
      status: "pending",
      source: "yandex_constructor",
      source_id: court.sourceId,
      created_by: current!.profile.id,
    });
  }

  if (rows.length) {
    const inserted = await current!.client.from("courts").insert(rows);
    if (inserted.error) throw inserted.error;
  }
  return json(
    {
      received: prepared.length,
      imported: rows.length,
      skipped: duplicateSource + duplicateLocation,
      skipped_by_source: duplicateSource,
      skipped_by_distance: duplicateLocation,
      status: "pending",
    },
    201,
  );
}

const photoPrepare = z.object({
  action: z.literal("prepare"),
  filename: z.string().min(1).max(255),
  content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});
const photoComplete = z.object({
  action: z.literal("complete"),
  path: z.string().min(10).max(500),
});

async function courtPhoto(request: NextRequest, courtId: number) {
  const current = await identity(request, true);
  await rateLimit(request, "photo-upload", 20, 3600, current!.profile.id);
  await oneCourt(current!.client, String(courtId));
  const payload = await body(request);
  const prepare = photoPrepare.safeParse(payload);
  const complete = photoComplete.safeParse(payload);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "hoopmap-media";

  if (prepare.success) {
    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[prepare.data.content_type];
    const path = `courts/${courtId}/${current!.profile.id}/${crypto.randomUUID()}.${extension}`;
    const signed = await createServiceClient().storage.from(bucket).createSignedUploadUrl(path);
    if (signed.error) throw signed.error;
    return json({ path, token: signed.data.token });
  }
  if (complete.success) {
    const expectedPrefix = `courts/${courtId}/${current!.profile.id}/`;
    if (!complete.data.path.startsWith(expectedPrefix)) throw new HttpError(403, "Недопустимый путь");
    const folder = complete.data.path.slice(0, complete.data.path.lastIndexOf("/"));
    const filename = complete.data.path.slice(complete.data.path.lastIndexOf("/") + 1);
    const stored = await createServiceClient().storage
      .from(bucket)
      .list(folder, { search: filename, limit: 1 });
    if (stored.error || !stored.data?.some((item) => item.name === filename)) {
      throw new HttpError(400, "Фотография не загружена");
    }
    const inserted = await current!.client
      .from("court_photos")
      .insert({
        court_id: courtId,
        storage_path: complete.data.path,
        uploaded_by: current!.profile.id,
        status: "pending",
      })
      .select("id,status")
      .single();
    if (inserted.error) throw inserted.error;
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}`;
    return json(
      {
        id: Number(inserted.data.id),
        image: `${base}/${complete.data.path}`,
        thumbnail: `${base}/${complete.data.path}`,
        status: inserted.data.status,
      },
      201,
    );
  }
  throw new HttpError(400, "Некорректные параметры фотографии");
}

async function favoriteCourt(request: NextRequest, courtId: number) {
  const current = await identity(request, true);
  if (request.method === "POST") {
    const result = await current!.client
      .from("favorite_courts")
      .upsert({ user_id: current!.profile.id, court_id: courtId });
    if (result.error) throw result.error;
    return json({ is_favorite: true }, 201);
  }
  const result = await current!.client
    .from("favorite_courts")
    .delete()
    .eq("user_id", current!.profile.id)
    .eq("court_id", courtId);
  if (result.error) throw result.error;
  return empty();
}

async function verifyCourt(request: NextRequest, courtId: number) {
  const current = await identity(request, true);
  await rateLimit(request, "court-verify", 30, 3600, current!.profile.id);
  const input = z
    .object({ is_confirmed: z.boolean().default(true), comment: z.string().max(1000).default("") })
    .safeParse(await body(request));
  if (!input.success) throw new HttpError(400, "Некорректное подтверждение");
  const result = await current!.client.rpc("verify_court", {
    target_court_id: courtId,
    confirmed: input.data.is_confirmed,
    verification_comment: input.data.comment,
  });
  if (result.error) throw result.error;
  return json(result.data, 201);
}

async function reviewCourt(request: NextRequest, courtId: number) {
  const current = await identity(request, true);
  await rateLimit(request, "court-review", 20, 3600, current!.profile.id);
  const input = z
    .object({ rating: z.number().int().min(1).max(5), text: z.string().max(3000).default("") })
    .safeParse(await body(request));
  if (!input.success) throw new HttpError(400, "Проверьте отзыв", input.error.flatten());
  const result = await current!.client
    .from("court_reviews")
    .upsert(
      {
        court_id: courtId,
        user_id: current!.profile.id,
        rating: input.data.rating,
        text: input.data.text,
      },
      { onConflict: "court_id,user_id" },
    )
    .select("id,rating,text,created_at,updated_at")
    .single();
  if (result.error) throw result.error;
  return json({ ...result.data, user: publicUser(current!.profile) }, 201);
}

async function reportCourt(request: NextRequest, courtId: number) {
  const current = await identity(request, true);
  await rateLimit(request, "court-report", 10, 3600, current!.profile.id);
  const input = z
    .object({
      report_type: z.enum([
        "not_exists",
        "closed",
        "hoop_damaged",
        "surface_damaged",
        "wrong_address",
        "wrong_details",
        "duplicate",
        "other",
      ]),
      description: z.string().max(3000).default(""),
    })
    .safeParse(await body(request));
  if (!input.success) throw new HttpError(400, "Проверьте жалобу", input.error.flatten());
  const result = await current!.client
    .from("court_reports")
    .insert({
      court_id: courtId,
      user_id: current!.profile.id,
      report_type: input.data.report_type,
      description: input.data.description,
      status: "open",
    })
    .select("id,report_type,description,status,created_at,resolved_at")
    .single();
  if (result.error) throw result.error;
  return json(result.data, 201);
}

async function duplicateCourts(request: NextRequest, courtId: number) {
  const { client } = await clientFor(request);
  const source = await oneCourt(client, String(courtId));
  const nearby = await client.rpc("nearby_courts", {
    lat: Number(source.latitude),
    lon: Number(source.longitude),
    radius_m: 50,
  });
  if (nearby.error) throw nearby.error;
  const rows = (nearby.data ?? []).filter(
    (item: { court_id: number }) => Number(item.court_id) !== courtId,
  );
  const records = await courtRecords(
    client,
    rows.map((item: { court_id: number }) => Number(item.court_id)),
  );
  const distances = new Map<number, number>(
    rows.map((item: { court_id: number; distance_m: number }) => [
      Number(item.court_id),
      Number(item.distance_m),
    ]),
  );
  return json(
    records.map((record: any) =>
      serializeCourt(record, distances.get(Number(record.id))),
    ),
  );
}

async function moderateCourt(request: NextRequest, courtId: number) {
  const current = await identity(request, true);
  if (!isModerator(current!.profile)) throw new HttpError(403, "Недостаточно прав");
  const input = z
    .object({ status: z.enum(["published", "rejected", "closed", "temporarily_closed"]) })
    .safeParse(await body(request));
  if (!input.success) throw new HttpError(400, "Недопустимый статус");
  const updated = await current!.client
    .from("courts")
    .update({ status: input.data.status })
    .eq("id", courtId)
    .select("name,created_by")
    .single();
  if (updated.error) throw updated.error;

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (token && updated.data.created_by) {
    const owner = await createServiceClient()
      .from("profiles")
      .select("telegram_id")
      .eq("id", updated.data.created_by)
      .maybeSingle();
    if (owner.data?.telegram_id) {
      const label = input.data.status === "published" ? "опубликована" : "отклонена";
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: owner.data.telegram_id,
          text: `Площадка «${updated.data.name}» ${label}.`,
        }),
      }).catch(() => undefined);
    }
  }
  return json(serializeCourt(await oneCourt(current!.client, String(courtId))));
}

async function gameRecords(client: DatabaseClient) {
  const result = await client.from("games").select(`
    *,
    creator:profiles!games_creator_id_fkey(
      id,username,first_name,last_name,avatar_url,role,reputation
    ),
    participants:game_participants(status,user_id)
  `);
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function serializeGames(client: DatabaseClient, records: any[], current?: RequestIdentity | null) {
  const courts = await courtRecords(
    client,
    Array.from(new Set(records.map((record) => Number(record.court_id)))),
  );
  const byId = new Map(courts.map((record: any) => [Number(record.id), serializeCourt(record)]));
  return records
    .filter((record) => byId.has(Number(record.court_id)))
    .map((record) => ({
      ...serializeGame(
        {
          ...record,
          participants: (record.participants ?? []).map((participant: any) => ({
            ...participant,
            mine: current ? Number(participant.user_id) === current.profile.id : false,
          })),
        },
        byId.get(Number(record.court_id))!,
      ),
    }));
}

async function listGames(request: NextRequest) {
  const { current, client } = await clientFor(request);
  let records = await gameRecords(client);
  const params = request.nextUrl.searchParams;
  if (params.get("mine") === "true") {
    if (!current) throw new HttpError(401, "Требуется авторизация");
    records = records.filter(
      (game: any) =>
        Number(game.creator_id) === current.profile.id ||
        (game.participants ?? []).some(
          (item: any) => Number(item.user_id) === current.profile.id && item.status === "joined",
        ),
    );
  }
  const filters: Array<[string, string]> = [
    ["status", "status"],
    ["skill_level", "skill_level"],
    ["level", "skill_level"],
    ["court", "court_id"],
  ];
  for (const [param, field] of filters) {
    const value = params.get(param);
    if (value) records = records.filter((record: any) => String(record[field]) === value);
  }
  const date = params.get("date");
  if (date) records = records.filter((record: any) => record.starts_at.slice(0, 10) === date);
  records.sort((a: any, b: any) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const all = await serializeGames(client, records, current);
  const { from, to } = pageParams(request.nextUrl);
  return json(pageResponse(request.nextUrl, all.slice(from, to + 1), all.length));
}

async function oneGame(request: NextRequest, gameId: number) {
  const { current, client } = await clientFor(request);
  const records = (await gameRecords(client)).filter((record: any) => Number(record.id) === gameId);
  if (!records.length) throw new HttpError(404, "Игра не найдена");
  return json((await serializeGames(client, records, current))[0]);
}

const gameInput = z.object({
  court: z.number().int().positive(),
  title: z.string().trim().min(3).max(180),
  description: z.string().max(3000).default(""),
  starts_at: z.string().datetime({ local: true }),
  ends_at: z.string().datetime({ local: true }),
  skill_level: z.enum(["any", "beginner", "intermediate", "advanced"]),
  max_players: z.number().int().min(2).max(100),
});

async function createGame(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(request, "game-create", 10, 3600, current!.profile.id);
  const parsed = gameInput.safeParse(await body(request));
  if (!parsed.success || Date.parse(parsed.data.ends_at) <= Date.parse(parsed.data.starts_at)) {
    throw new HttpError(400, "Проверьте параметры игры", parsed.success ? undefined : parsed.error.flatten());
  }
  const value = parsed.data;
  const created = await current!.client.rpc("create_game", {
    target_court_id: value.court,
    game_title: value.title,
    game_description: value.description,
    game_starts_at: new Date(value.starts_at).toISOString(),
    game_ends_at: new Date(value.ends_at).toISOString(),
    game_skill_level: value.skill_level,
    game_max_players: value.max_players,
  });
  if (created.error) throw created.error;
  return await oneGame(request, Number(created.data));
}

async function gameMembership(request: NextRequest, gameId: number, action: "join" | "leave") {
  const current = await identity(request, true);
  await rateLimit(request, "game-membership", 60, 3600, current!.profile.id);
  const result = await current!.client.rpc(action === "join" ? "join_game" : "leave_game", {
    target_game_id: gameId,
  });
  if (result.error) throw result.error;
  return action === "join" ? json({ status: "joined" }, 201) : empty();
}

async function authTelegram(request: NextRequest) {
  await rateLimit(request, "telegram-auth", 20, 900);
  const parsed = z.object({ init_data: z.string().min(1).max(8192) }).safeParse(await body(request));
  if (!parsed.success) throw new HttpError(400, "Некорректные данные Telegram");
  const profile = await ensureTelegramUser(validateTelegramInitData(parsed.data.init_data));
  const session = await createTelegramSession(profile);
  const response = json({ access: session.access_token, user: privateUser(profile) });
  response.cookies.set(refreshCookieName(), session.refresh_token, refreshCookieOptions());
  return response;
}

function emailConfirmationRedirect(request: NextRequest): string {
  const configured =
    process.env.SITE_URL?.trim() || process.env.TELEGRAM_WEBAPP_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SITE_URL is not configured");
  }
  const base = new URL(configured || request.nextUrl.origin);
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
    throw new Error("SITE_URL must use HTTPS");
  }
  return new URL("/login?confirmed=1", base).toString();
}

function sessionResponse(
  accessToken: string,
  refreshToken: string,
  profile: Awaited<ReturnType<typeof ensureEmailProfile>>,
) {
  const response = json({
    access: accessToken,
    user: privateUser(profile),
    requires_confirmation: false,
  });
  response.cookies.set(
    refreshCookieName(),
    refreshToken,
    refreshCookieOptions(),
  );
  return response;
}

async function authEmailRegister(request: NextRequest) {
  await rateLimit(request, "email-register", 5, 3600);
  const parsed = emailRegistrationSchema.safeParse(await body(request));
  if (!parsed.success) {
    throw new HttpError(
      400,
      parsed.error.issues[0]?.message ?? "Проверьте данные регистрации",
    );
  }

  const client = createRequestClient();
  const confirmationResponse = () =>
    json(
      {
        requires_confirmation: true,
        message:
          "Если адрес доступен для регистрации, на него отправлено письмо. Подтвердите email и войдите с паролем.",
      },
      202,
    );
  const registered = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: emailConfirmationRedirect(request),
      data: {
        provider: "email",
        display_name: parsed.data.name,
      },
    },
  });
  if (registered.error) {
    const duplicate = /already registered|already exists/i.test(
      registered.error.message,
    );
    if (!duplicate) {
      throw new HttpError(400, "Не удалось создать аккаунт");
    }
  }

  const authUser = registered.data.user;
  const isNewIdentity = Boolean(authUser?.identities?.length);
  if (!authUser || !isNewIdentity) return confirmationResponse();

  const profile = await ensureEmailProfile(authUser, parsed.data.name);
  const session = registered.data.session;
  if (!session) return confirmationResponse();
  return sessionResponse(
    session.access_token,
    session.refresh_token,
    profile,
  );
}

async function authEmailLogin(request: NextRequest) {
  await rateLimit(request, "email-login", 10, 900);
  const parsed = emailLoginSchema.safeParse(await body(request));
  if (!parsed.success) {
    throw new HttpError(400, "Проверьте email и пароль");
  }
  const signedIn = await createRequestClient().auth.signInWithPassword(
    parsed.data,
  );
  if (signedIn.error || !signedIn.data.user || !signedIn.data.session) {
    throw new HttpError(401, "Неверный email или пароль");
  }
  const profile = await ensureEmailProfile(signedIn.data.user);
  return sessionResponse(
    signedIn.data.session.access_token,
    signedIn.data.session.refresh_token,
    profile,
  );
}

async function authRefresh(request: NextRequest) {
  const refreshToken = request.cookies.get(refreshCookieName())?.value;
  if (!refreshToken) throw new HttpError(401, "Сессия не найдена");
  const refreshed = await createRequestClient().auth.refreshSession({ refresh_token: refreshToken });
  if (refreshed.error || !refreshed.data.session) throw new HttpError(401, "Сессия истекла");
  const response = json({ access: refreshed.data.session.access_token });
  response.cookies.set(refreshCookieName(), refreshed.data.session.refresh_token, refreshCookieOptions());
  return response;
}

function authLogout() {
  const response = empty();
  response.cookies.set(refreshCookieName(), "", { ...refreshCookieOptions(), maxAge: 0 });
  return response;
}

async function updateMapHome(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(request, "map-home", 10, 3600, current!.profile.id);
  const input = z
    .union([
      z.object({
        location: z.object({
          lat: z.number().min(-90).max(90),
          lon: z.number().min(-180).max(180),
        }),
      }),
      z.object({ clear: z.literal(true) }),
    ])
    .safeParse(await body(request));
  if (!input.success) throw new HttpError(400, "Некорректная настройка района");

  const values =
    "clear" in input.data
      ? {
          map_home_lat: null,
          map_home_lon: null,
          map_home_consent_at: null,
        }
      : (() => {
          const approximate = approximateMapLocation(input.data.location);
          return {
            map_home_lat: approximate.lat,
            map_home_lon: approximate.lon,
            map_home_consent_at: new Date().toISOString(),
          };
        })();
  const updated = await createServiceClient()
    .from("profiles")
    .update(values)
    .eq("id", current!.profile.id)
    .select("*")
    .single();
  if (updated.error) throw updated.error;
  return json(privateUser(updated.data));
}

const telegramOidcCookies = {
  state: "hoopmap_tg_oidc_state",
  nonce: "hoopmap_tg_oidc_nonce",
  verifier: "hoopmap_tg_oidc_verifier",
  next: "hoopmap_tg_oidc_next",
} as const;

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value.slice(0, 500)
    : "/profile";
}

function telegramOidcCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/v1/auth/telegram",
    maxAge: 10 * 60,
  };
}

function telegramOidcRedirectUri(request: NextRequest): string {
  const configured = process.env.TELEGRAM_WEBAPP_URL?.trim();
  const base = new URL(configured || request.nextUrl.origin);
  return new URL("/api/v1/auth/telegram/callback/", base).toString();
}

function clearTelegramOidcCookies(response: NextResponse) {
  for (const name of Object.values(telegramOidcCookies)) {
    response.cookies.set(name, "", {
      ...telegramOidcCookieOptions(),
      maxAge: 0,
    });
  }
}

async function startTelegramWebLogin(request: NextRequest) {
  await rateLimit(request, "telegram-web-login-start", 30, 900);
  const { clientId } = telegramLoginConfig();
  const attempt = createTelegramOidcAttempt();
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const redirectUri = telegramOidcRedirectUri(request);
  const authorization = new URL("https://oauth.telegram.org/auth");
  authorization.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: attempt.challenge,
    code_challenge_method: "S256",
  }).toString();
  const response = NextResponse.redirect(authorization);
  const options = telegramOidcCookieOptions();
  response.cookies.set(telegramOidcCookies.state, attempt.state, options);
  response.cookies.set(telegramOidcCookies.nonce, attempt.nonce, options);
  response.cookies.set(telegramOidcCookies.verifier, attempt.verifier, options);
  response.cookies.set(telegramOidcCookies.next, next, options);
  return response;
}

async function finishTelegramWebLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.nextUrl.origin);
  try {
    await rateLimit(request, "telegram-web-login-callback", 30, 900);
    const code = request.nextUrl.searchParams.get("code") ?? "";
    const state = request.nextUrl.searchParams.get("state") ?? "";
    const expectedState =
      request.cookies.get(telegramOidcCookies.state)?.value ?? "";
    const nonce = request.cookies.get(telegramOidcCookies.nonce)?.value ?? "";
    const verifier =
      request.cookies.get(telegramOidcCookies.verifier)?.value ?? "";
    if (
      !code ||
      code.length > 4096 ||
      !state ||
      !expectedState ||
      state !== expectedState ||
      !nonce ||
      !verifier
    ) {
      throw new Error("Invalid Telegram login state");
    }
    const redirectUri = telegramOidcRedirectUri(request);
    const idToken = await exchangeTelegramCode({ code, verifier, redirectUri });
    const identity = await validateTelegramIdToken(idToken, nonce);
    const profile = await ensureTelegramUser(identity);
    const session = await createTelegramSession(profile);
    const destination = new URL(
      safeNextPath(
        request.cookies.get(telegramOidcCookies.next)?.value ?? "/profile",
      ),
      request.nextUrl.origin,
    );
    const response = NextResponse.redirect(destination);
    response.cookies.set(
      refreshCookieName(),
      session.refresh_token,
      refreshCookieOptions(),
    );
    clearTelegramOidcCookies(response);
    return response;
  } catch (error) {
    console.error("Telegram web login failed", error);
    loginUrl.searchParams.set("error", "telegram");
    const response = NextResponse.redirect(loginUrl);
    clearTelegramOidcCookies(response);
    return response;
  }
}

async function dispatch(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const [resource, lookup, action] = segments;
  if (resource === "auth") {
    if (lookup === "telegram" && request.method === "POST") return authTelegram(request);
    if (lookup === "telegram" && action === "start" && request.method === "GET") {
      return startTelegramWebLogin(request);
    }
    if (
      lookup === "telegram" &&
      action === "callback" &&
      request.method === "GET"
    ) {
      return finishTelegramWebLogin(request);
    }
    if (lookup === "email" && action === "register" && request.method === "POST") {
      return authEmailRegister(request);
    }
    if (lookup === "email" && action === "login" && request.method === "POST") {
      return authEmailLogin(request);
    }
    if (lookup === "refresh" && request.method === "POST") return authRefresh(request);
    if (lookup === "logout" && request.method === "POST") return authLogout();
    if (lookup === "map-home" && request.method === "PATCH") {
      return updateMapHome(request);
    }
    if (lookup === "me" && request.method === "GET") {
      const current = await identity(request, true);
      return json(privateUser(current!.profile));
    }
  }
  if (resource === "courts") {
    if (!lookup && request.method === "GET") return listCourts(request);
    if (!lookup && request.method === "POST") return createCourt(request);
    if (lookup === "nearby" && request.method === "GET") return nearbyCourts(request);
    if (lookup === "import" && request.method === "POST") return importCourts(request);
    if (lookup && !action && request.method === "GET") {
      const { client } = await clientFor(request);
      return json(serializeCourt(await oneCourt(client, lookup)));
    }
    const courtId = positiveInt(lookup);
    if (action === "photos" && request.method === "POST") return courtPhoto(request, courtId);
    if (action === "favorite" && ["POST", "DELETE"].includes(request.method)) {
      return favoriteCourt(request, courtId);
    }
    if (action === "verify" && request.method === "POST") return verifyCourt(request, courtId);
    if (action === "reviews" && request.method === "POST") return reviewCourt(request, courtId);
    if (action === "reports" && request.method === "POST") return reportCourt(request, courtId);
    if (action === "duplicates" && request.method === "GET") return duplicateCourts(request, courtId);
    if (action === "moderate" && request.method === "POST") return moderateCourt(request, courtId);
  }
  if (resource === "games") {
    if (!lookup && request.method === "GET") return listGames(request);
    if (!lookup && request.method === "POST") return createGame(request);
    const gameId = positiveInt(lookup);
    if (!action && request.method === "GET") return oneGame(request, gameId);
    if (action === "join" && request.method === "POST") return gameMembership(request, gameId, "join");
    if (action === "leave" && request.method === "POST") return gameMembership(request, gameId, "leave");
  }
  throw new HttpError(404, "Маршрут не найден");
}

async function handler(request: NextRequest, context: RouteContext) {
  try {
    const { path = [] } = await context.params;
    return await dispatch(request, path.filter(Boolean));
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ detail: error.message, errors: error.details }, error.status);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const duplicate = message.includes("duplicate key") || message.includes("unique constraint");
    const auth = message.includes("JWT") || message.includes("Authentication required");
    console.error("API error", error);
    return json(
      { detail: auth ? "Требуется авторизация" : duplicate ? "Такая запись уже существует" : "Ошибка сервера" },
      auth ? 401 : duplicate ? 409 : 500,
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
