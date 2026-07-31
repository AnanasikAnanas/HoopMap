/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  bearerToken,
  createRequestClient,
  createPkceRequestClient,
  createServiceClient,
  getIdentity,
  isModerator,
  refreshCookieName,
  refreshCookieOptions,
  type RequestIdentity,
  supabaseUrl,
} from "@/lib/supabase/server";
import {
  createTelegramSession,
  ensureTelegramUser,
  validateTelegramInitData,
  validateTelegramLoginWidgetData,
} from "@/lib/supabase/telegram-auth";
import { issueTelegramAccountLink } from "@/lib/supabase/account-linking";
import {
  emailLoginSchema,
  emailRegistrationSchema,
  ensureEmailProfile,
  passwordResetRequestSchema,
  passwordUpdateSchema,
} from "@/lib/supabase/email-auth";
import {
  createTelegramOidcAttempt,
  exchangeTelegramCode,
  telegramLoginConfig,
  validateTelegramIdToken,
} from "@/lib/supabase/telegram-oidc";
import {
  courtSelect,
  effectiveGameStatus,
  privateUser,
  publicUser,
  serializeCourt,
  serializeGame,
} from "@/lib/supabase/serializers";
import { notifyProfilesInTelegram } from "@/lib/telegram-notifications";
import { notifyProfilesInWebPush, webPushConfigured } from "@/lib/web-push";
import { approximateMapLocation } from "@/lib/location-privacy";
import {
  googleCallbackUrl,
  googleOAuthCookieOptions,
  googleOAuthCookies,
  isValidGooglePkceVerifier,
  safeOAuthNext,
} from "@/lib/supabase/google-auth";
import {
  isValidRecoveryPkceVerifier,
  passwordRecoveryCookieOptions,
  passwordRecoveryCookies,
  passwordRecoveryUrl,
  verifyPasswordRecoveryProof,
} from "@/lib/supabase/password-recovery";

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
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function empty(status = 204): NextResponse {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function body(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new HttpError(415, "Ожидается JSON");
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }
}

async function identity(
  request: NextRequest,
  required = false,
): Promise<RequestIdentity | null> {
  const result = await getIdentity(request);
  if (!result && (required || bearerToken(request)))
    throw new HttpError(401, "Требуется авторизация");
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
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const secret =
    process.env.RATE_LIMIT_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "development-only";
  const subject = profileId ? `user:${profileId}` : `ip:${forwarded}`;
  const digest = createHmac("sha256", secret)
    .update(subject)
    .digest("hex")
    .slice(0, 32);
  const result = await createServiceClient().rpc("consume_rate_limit", {
    target_key: `${scope}:${digest}`,
    maximum_requests: maximumRequests,
    window_seconds: windowSeconds,
  });
  if (result.error) throw result.error;
  if (!result.data)
    throw new HttpError(429, "Слишком много запросов. Попробуйте позже.");
}

function positiveInt(value: string | undefined, field = "id"): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0)
    throw new HttpError(400, `Некорректный ${field}`);
  return result;
}

function pageParams(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("page_size") || 20) || 20),
  );
  return {
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1,
  };
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
  if ((favoriteOnly || mineOnly) && !current)
    throw new HttpError(401, "Требуется авторизация");

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
    if (value === "true" || value === "false")
      query = query.eq(field, value === "true");
  }
  const hoops = url.searchParams.get("hoops_count");
  const minHoops = url.searchParams.get("hoops_count_min");
  if (hoops) query = query.eq("hoops_count", positiveInt(hoops, "hoops_count"));
  if (minHoops)
    query = query.gte("hoops_count", positiveInt(minHoops, "hoops_count_min"));
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
      throw new HttpError(
        400,
        "bbox должен быть min_lon,min_lat,max_lon,max_lat",
      );
    }
    query = query
      .gte("longitude", values[0])
      .gte("latitude", values[1])
      .lte("longitude", values[2])
      .lte("latitude", values[3]);
  }

  const result = await query
    .order("created_at", { ascending: false })
    .range(from, to);
  if (result.error) throw result.error;
  const courts = (result.data ?? []).map((record) => serializeCourt(record));
  return json(pageResponse(url, courts, result.count ?? courts.length));
}

async function nearbyCourts(request: NextRequest) {
  const { client } = await clientFor(request);
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  const radius = Number(request.nextUrl.searchParams.get("radius") || 5000);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isInteger(radius)
  ) {
    throw new HttpError(400, "Передайте корректные lat, lon и radius");
  }
  const nearby = await client.rpc("nearby_courts", {
    lat,
    lon,
    radius_m: radius,
  });
  if (nearby.error) throw nearby.error;
  const rows = (nearby.data ?? []) as Array<{
    court_id: number;
    distance_m: number;
  }>;
  const records = await courtRecords(
    client,
    rows.map((item) => Number(item.court_id)),
  );
  const byId = new Map(
    records.map((record: any) => [Number(record.id), record]),
  );
  const all = rows
    .filter((item) => byId.has(Number(item.court_id)))
    .map((item) =>
      serializeCourt(byId.get(Number(item.court_id)), Number(item.distance_m)),
    );
  const { from, to } = pageParams(request.nextUrl);
  return json(
    pageResponse(request.nextUrl, all.slice(from, to + 1), all.length),
  );
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
  access_type: z
    .enum(["free", "restricted", "paid", "private"])
    .default("free"),
  surface: z
    .enum(["asphalt", "rubber", "concrete", "parquet", "other"])
    .default("other"),
  hoops_count: z.number().int().min(1).max(20),
  has_lighting: z.boolean().default(false),
  has_marking: z.boolean().default(true),
  has_nets: z.boolean().default(false),
  condition: z
    .enum(["excellent", "good", "fair", "poor", "unknown"])
    .default("unknown"),
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
  if (!parsed.success)
    throw new HttpError(400, "Проверьте поля площадки", parsed.error.flatten());
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
  return json(
    serializeCourt(await oneCourt(current!.client, String(inserted.data.id))),
    201,
  );
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
  if (!isModerator(current!.profile))
    throw new HttpError(403, "Недостаточно прав");
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
  const sourceIds = Array.from(
    new Set(prepared.map((court) => court.sourceId)),
  );
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
  size: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
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
    const signed = await createServiceClient()
      .storage.from(bucket)
      .createSignedUploadUrl(path);
    if (signed.error) throw signed.error;
    return json({ path, token: signed.data.token });
  }
  if (complete.success) {
    const expectedPrefix = `courts/${courtId}/${current!.profile.id}/`;
    if (!complete.data.path.startsWith(expectedPrefix))
      throw new HttpError(403, "Недопустимый путь");
    const folder = complete.data.path.slice(
      0,
      complete.data.path.lastIndexOf("/"),
    );
    const filename = complete.data.path.slice(
      complete.data.path.lastIndexOf("/") + 1,
    );
    const stored = await createServiceClient()
      .storage.from(bucket)
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
    .object({
      is_confirmed: z.boolean().default(true),
      comment: z.string().max(1000).default(""),
    })
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
    .object({
      rating: z.number().int().min(1).max(5),
      text: z.string().max(3000).default(""),
    })
    .safeParse(await body(request));
  if (!input.success)
    throw new HttpError(400, "Проверьте отзыв", input.error.flatten());
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
  if (!input.success)
    throw new HttpError(400, "Проверьте жалобу", input.error.flatten());
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
  if (!isModerator(current!.profile))
    throw new HttpError(403, "Недостаточно прав");
  const input = z
    .object({
      status: z.enum(["published", "rejected", "closed", "temporarily_closed"]),
    })
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
      const label =
        input.data.status === "published" ? "опубликована" : "отклонена";
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

async function gameRecords(client: DatabaseClient, gameId?: number) {
  let query = client.from("games").select(`
    *,
    creator:profiles!games_creator_id_fkey(
      id,username,first_name,last_name,avatar_url,role,reputation
    ),
    participants:game_participants(
      status,user_id,joined_at,
      profile:profiles!game_participants_user_id_fkey(
        id,username,first_name,last_name,avatar_url,role,reputation
      )
    )
  `);
  if (gameId != null) query = query.eq("id", gameId);
  const result = await query;
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function serializeGames(
  client: DatabaseClient,
  records: any[],
  current?: RequestIdentity | null,
) {
  const courts = await courtRecords(
    client,
    Array.from(new Set(records.map((record) => Number(record.court_id)))),
  );
  const byId = new Map(
    courts.map((record: any) => [Number(record.id), serializeCourt(record)]),
  );
  return records
    .filter((record) => byId.has(Number(record.court_id)))
    .map((record) => ({
      ...serializeGame(
        {
          ...record,
          mine_owner: current
            ? Number(record.creator_id) === current.profile.id
            : false,
          participants: (record.participants ?? []).map((participant: any) => ({
            ...participant,
            mine: current
              ? Number(participant.user_id) === current.profile.id
              : false,
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
          (item: any) =>
            Number(item.user_id) === current.profile.id &&
            item.status === "joined",
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
    if (value)
      records = records.filter(
        (record: any) =>
          String(
            field === "status" ? effectiveGameStatus(record) : record[field],
          ) === value,
      );
  }
  const date = params.get("date");
  if (date)
    records = records.filter(
      (record: any) => record.starts_at.slice(0, 10) === date,
    );
  if (params.get("upcoming") === "true") {
    records = records.filter(
      (record: any) => Date.parse(record.ends_at) > Date.now(),
    );
  }
  const bbox = params.get("bbox");
  if (bbox) {
    const values = bbox.split(",").map(Number);
    if (
      values.length !== 4 ||
      values.some((value) => !Number.isFinite(value)) ||
      values[0] >= values[2] ||
      values[1] >= values[3]
    ) {
      throw new HttpError(
        400,
        "bbox должен быть min_lon,min_lat,max_lon,max_lat",
      );
    }
    const courtsInBounds = await client
      .from("courts")
      .select("id")
      .gte("longitude", values[0])
      .gte("latitude", values[1])
      .lte("longitude", values[2])
      .lte("latitude", values[3]);
    if (courtsInBounds.error) throw courtsInBounds.error;
    const courtIds = new Set(
      (courtsInBounds.data ?? []).map((court) => Number(court.id)),
    );
    records = records.filter((record: any) =>
      courtIds.has(Number(record.court_id)),
    );
  }
  records.sort(
    (a: any, b: any) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  const all = await serializeGames(client, records, current);
  const { from, to } = pageParams(request.nextUrl);
  return json(
    pageResponse(request.nextUrl, all.slice(from, to + 1), all.length),
  );
}

async function oneGame(request: NextRequest, gameId: number) {
  const { current, client } = await clientFor(request);
  const records = await gameRecords(client, gameId);
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
const gameUpdateInput = gameInput.omit({ court: true });

function gameParticipantIds(record: any, excludedProfileId?: number): number[] {
  return (record.participants ?? [])
    .filter((participant: any) => participant.status === "joined")
    .map((participant: any) => Number(participant.user_id))
    .filter(
      (profileId: number) =>
        Number.isSafeInteger(profileId) && profileId !== excludedProfileId,
    );
}

function gameNotificationDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Samara",
  }).format(new Date(value));
}

async function notifyGameProfiles(
  profileIds: number[],
  telegramText: string,
  pushTitle: string,
  pushBody: string,
  path: string,
  tag: string,
): Promise<void> {
  const uniqueIds = Array.from(
    new Set(
      profileIds.filter(
        (profileId) => Number.isSafeInteger(profileId) && profileId > 0,
      ),
    ),
  );
  if (!uniqueIds.length) return;
  try {
    const preferences = await createServiceClient()
      .from("notification_preferences")
      .select("user_id,game_updates")
      .in("user_id", uniqueIds)
      .eq("game_updates", false);
    if (preferences.error) throw preferences.error;
    const disabled = new Set(
      (preferences.data ?? []).map((record) => Number(record.user_id)),
    );
    const recipients = uniqueIds.filter(
      (profileId) => !disabled.has(profileId),
    );
    await Promise.allSettled([
      notifyProfilesInTelegram(recipients, telegramText, path),
      ...(webPushConfigured()
        ? [
            notifyProfilesInWebPush(recipients, {
              title: pushTitle,
              body: pushBody,
              url: path,
              tag,
            }),
          ]
        : []),
    ]);
  } catch {
    // Notification delivery must never roll back the successful game action.
  }
}

function profileDisplayName(profile: RequestIdentity["profile"]): string {
  return (
    `${profile.first_name} ${profile.last_name}`.trim() ||
    profile.username ||
    "Игрок"
  );
}

function throwGameMutationError(error: { message: string }): never {
  if (error.message.includes("not found")) {
    throw new HttpError(404, "Игра не найдена");
  }
  if (error.message.includes("forbidden")) {
    throw new HttpError(403, "Управлять игрой может только организатор");
  }
  if (error.message.includes("Player limit")) {
    throw new HttpError(
      409,
      "Лимит игроков не может быть меньше числа участников",
    );
  }
  if (
    error.message.includes("cannot be edited") ||
    error.message.includes("finished")
  ) {
    throw new HttpError(409, "Эту игру уже нельзя изменить");
  }
  if (
    error.message.includes("Invalid") ||
    error.message.includes("Description is too long")
  ) {
    throw new HttpError(400, "Проверьте параметры игры");
  }
  throw error;
}

async function createGame(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(request, "game-create", 10, 3600, current!.profile.id);
  const parsed = gameInput.safeParse(await body(request));
  if (
    !parsed.success ||
    Date.parse(parsed.data.ends_at) <= Date.parse(parsed.data.starts_at) ||
    Date.parse(parsed.data.starts_at) <= Date.now()
  ) {
    throw new HttpError(
      400,
      "Проверьте параметры игры",
      parsed.success ? undefined : parsed.error.flatten(),
    );
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

async function updateGame(request: NextRequest, gameId: number) {
  const current = await identity(request, true);
  await rateLimit(request, "game-update", 20, 3600, current!.profile.id);
  const parsed = gameUpdateInput.safeParse(await body(request));
  if (
    !parsed.success ||
    Date.parse(parsed.data.ends_at) <= Date.parse(parsed.data.starts_at) ||
    Date.parse(parsed.data.starts_at) <= Date.now()
  ) {
    throw new HttpError(
      400,
      "Проверьте параметры игры",
      parsed.success ? undefined : parsed.error.flatten(),
    );
  }
  const before = (await gameRecords(current!.client, gameId))[0];
  if (!before) throw new HttpError(404, "Игра не найдена");

  const value = parsed.data;
  const updated = await current!.client.rpc("update_game", {
    target_game_id: gameId,
    game_title: value.title,
    game_description: value.description,
    game_starts_at: new Date(value.starts_at).toISOString(),
    game_ends_at: new Date(value.ends_at).toISOString(),
    game_skill_level: value.skill_level,
    game_max_players: value.max_players,
  });
  if (updated.error) throwGameMutationError(updated.error);

  await notifyGameProfiles(
    gameParticipantIds(before, current!.profile.id),
    `🏀 Игра «${value.title}» обновлена.\nНовое время: ${gameNotificationDate(value.starts_at)}.`,
    "Игра обновлена 🏀",
    `«${value.title}» — ${gameNotificationDate(value.starts_at)}`,
    `/games/${gameId}`,
    `game-${gameId}-updated`,
  );
  return oneGame(request, gameId);
}

async function cancelGame(request: NextRequest, gameId: number) {
  const current = await identity(request, true);
  await rateLimit(request, "game-cancel", 10, 3600, current!.profile.id);
  const before = (await gameRecords(current!.client, gameId))[0];
  if (!before) throw new HttpError(404, "Игра не найдена");
  const cancelled = await current!.client.rpc("cancel_game", {
    target_game_id: gameId,
  });
  if (cancelled.error) throwGameMutationError(cancelled.error);

  await notifyGameProfiles(
    gameParticipantIds(before, current!.profile.id),
    `❌ Игра «${before.title}» отменена организатором.`,
    "Игра отменена",
    `Организатор отменил игру «${before.title}»`,
    `/games/${gameId}`,
    `game-${gameId}-cancelled`,
  );
  return oneGame(request, gameId);
}

async function gameMembership(
  request: NextRequest,
  gameId: number,
  action: "join" | "leave",
) {
  const current = await identity(request, true);
  await rateLimit(request, "game-membership", 60, 3600, current!.profile.id);
  const game = (await gameRecords(current!.client, gameId))[0];
  if (!game) throw new HttpError(404, "Игра не найдена");
  const result = await current!.client.rpc(
    action === "join" ? "join_game" : "leave_game",
    {
      target_game_id: gameId,
    },
  );
  if (result.error) {
    const message = result.error.message;
    if (message.includes("Game is full")) {
      throw new HttpError(409, "В игре больше нет свободных мест");
    }
    if (message.includes("Already joined")) {
      throw new HttpError(409, "Вы уже участвуете в этой игре");
    }
    if (message.includes("Game cannot be joined")) {
      throw new HttpError(409, "К этой игре уже нельзя присоединиться");
    }
    if (message.includes("Creator must cancel")) {
      throw new HttpError(409, "Организатор может только отменить игру");
    }
    throw result.error;
  }
  if (action === "join") {
    await createServiceClient()
      .from("game_invitations")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("game_id", gameId)
      .eq("invitee_id", current!.profile.id)
      .eq("status", "pending");
  }
  if (Number(game.creator_id) !== current!.profile.id) {
    const playerName = profileDisplayName(current!.profile);
    await notifyGameProfiles(
      [Number(game.creator_id)],
      action === "join"
        ? `🙌 ${playerName} присоединился к игре «${game.title}».`
        : `${playerName} вышел из игры «${game.title}».`,
      action === "join" ? "Новый участник" : "Участник вышел",
      action === "join"
        ? `${playerName} присоединился к игре «${game.title}»`
        : `${playerName} вышел из игры «${game.title}»`,
      `/games/${gameId}`,
      `game-${gameId}-${action}-${current!.profile.id}`,
    );
  }
  return oneGame(request, gameId);
}

const gameMessageSelect = `
  id,game_id,author_id,body,is_pinned,deleted_at,created_at,
  author:profiles!game_messages_author_id_fkey(
    id,username,first_name,last_name,avatar_url,role,reputation
  )
`;

async function gameChatAccess(request: NextRequest, gameId: number) {
  const current = await identity(request, true);
  const service = createServiceClient();
  const game = await service
    .from("games")
    .select("id,creator_id,status,ends_at")
    .eq("id", gameId)
    .maybeSingle();
  if (game.error) throw game.error;
  if (!game.data) throw new HttpError(404, "Игра не найдена");

  const isOwner = Number(game.data.creator_id) === current!.profile.id;
  const moderator = isModerator(current!.profile);
  let isParticipant = isOwner;
  if (!isParticipant) {
    const membership = await service
      .from("game_participants")
      .select("status")
      .eq("game_id", gameId)
      .eq("user_id", current!.profile.id)
      .eq("status", "joined")
      .maybeSingle();
    if (membership.error) throw membership.error;
    isParticipant = Boolean(membership.data);
  }
  if (!isParticipant && !moderator) {
    throw new HttpError(403, "Чат доступен только участникам игры");
  }

  const chatClosesAt = Date.parse(game.data.ends_at) + 24 * 60 * 60 * 1000;
  return {
    current: current!,
    service,
    canPost:
      isParticipant &&
      game.data.status !== "cancelled" &&
      Date.now() <= chatClosesAt,
    canModerate: isOwner || moderator,
  };
}

function serializeGameMessage(
  record: any,
  current: RequestIdentity,
  canModerate: boolean,
) {
  const isDeleted = Boolean(record.deleted_at);
  const isMine = Number(record.author_id) === current.profile.id;
  return {
    id: Number(record.id),
    body: isDeleted ? "" : record.body,
    is_pinned: Boolean(record.is_pinned) && !isDeleted,
    is_deleted: isDeleted,
    created_at: record.created_at,
    author: publicUser(record.author),
    is_mine: isMine,
    can_delete: !isDeleted && (isMine || canModerate),
  };
}

async function gameMessageRecord(
  service: ReturnType<typeof createServiceClient>,
  gameId: number,
  messageId: number,
) {
  const message = await service
    .from("game_messages")
    .select(gameMessageSelect)
    .eq("id", messageId)
    .eq("game_id", gameId)
    .maybeSingle();
  if (message.error) throw message.error;
  if (!message.data) throw new HttpError(404, "Сообщение не найдено");
  return message.data;
}

async function listGameMessages(request: NextRequest, gameId: number) {
  const access = await gameChatAccess(request, gameId);
  const messages = await access.service
    .from("game_messages")
    .select(gameMessageSelect)
    .eq("game_id", gameId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (messages.error) throw messages.error;
  const records = (messages.data ?? []).reverse();
  const serialized = records.map((record) =>
    serializeGameMessage(record, access.current, access.canModerate),
  );

  let pinned = serialized.find((message) => message.is_pinned) ?? null;
  if (!pinned) {
    const pinnedRecord = await access.service
      .from("game_messages")
      .select(gameMessageSelect)
      .eq("game_id", gameId)
      .eq("is_pinned", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (pinnedRecord.error) throw pinnedRecord.error;
    if (pinnedRecord.data) {
      pinned = serializeGameMessage(
        pinnedRecord.data,
        access.current,
        access.canModerate,
      );
    }
  }

  return json({
    messages: serialized,
    pinned,
    can_post: access.canPost,
    can_moderate: access.canModerate,
  });
}

async function sendGameMessage(request: NextRequest, gameId: number) {
  const access = await gameChatAccess(request, gameId);
  await rateLimit(request, "game-chat-send", 30, 60, access.current.profile.id);
  if (!access.canPost) {
    throw new HttpError(409, "В эту игру уже нельзя отправлять сообщения");
  }
  const parsed = z
    .object({ message: z.string().trim().min(1).max(1000) })
    .safeParse(await body(request));
  if (!parsed.success) {
    throw new HttpError(
      400,
      "Сообщение должно содержать от 1 до 1000 символов",
    );
  }
  const inserted = await access.service
    .from("game_messages")
    .insert({
      game_id: gameId,
      author_id: access.current.profile.id,
      body: parsed.data.message,
    })
    .select(gameMessageSelect)
    .single();
  if (inserted.error) throw inserted.error;
  return json(
    serializeGameMessage(inserted.data, access.current, access.canModerate),
    201,
  );
}

async function deleteGameMessage(request: NextRequest, gameId: number) {
  const access = await gameChatAccess(request, gameId);
  await rateLimit(
    request,
    "game-chat-moderate",
    120,
    3600,
    access.current.profile.id,
  );
  const parsed = z
    .object({ message_id: z.number().int().positive() })
    .safeParse(await body(request));
  if (!parsed.success) throw new HttpError(400, "Некорректное сообщение");
  const message = await gameMessageRecord(
    access.service,
    gameId,
    parsed.data.message_id,
  );
  if (
    Number(message.author_id) !== access.current.profile.id &&
    !access.canModerate
  ) {
    throw new HttpError(403, "Можно удалить только своё сообщение");
  }
  if (message.deleted_at) {
    return json(
      serializeGameMessage(message, access.current, access.canModerate),
    );
  }
  const updated = await access.service
    .from("game_messages")
    .update({
      body: "",
      is_pinned: false,
      pinned_by: null,
      deleted_at: new Date().toISOString(),
      deleted_by: access.current.profile.id,
    })
    .eq("id", parsed.data.message_id)
    .eq("game_id", gameId)
    .select(gameMessageSelect)
    .single();
  if (updated.error) throw updated.error;
  return json(
    serializeGameMessage(updated.data, access.current, access.canModerate),
  );
}

async function pinGameMessage(request: NextRequest, gameId: number) {
  const access = await gameChatAccess(request, gameId);
  await rateLimit(
    request,
    "game-chat-moderate",
    120,
    3600,
    access.current.profile.id,
  );
  if (!access.canModerate) {
    throw new HttpError(403, "Закреплять сообщения может только организатор");
  }
  const parsed = z
    .object({
      message_id: z.number().int().positive(),
      pinned: z.boolean(),
    })
    .safeParse(await body(request));
  if (!parsed.success) throw new HttpError(400, "Некорректное сообщение");
  const message = await gameMessageRecord(
    access.service,
    gameId,
    parsed.data.message_id,
  );
  if (message.deleted_at) {
    throw new HttpError(409, "Удалённое сообщение нельзя закрепить");
  }
  if (parsed.data.pinned) {
    const unpinned = await access.service
      .from("game_messages")
      .update({ is_pinned: false, pinned_by: null })
      .eq("game_id", gameId)
      .eq("is_pinned", true);
    if (unpinned.error) throw unpinned.error;
  }
  const updated = await access.service
    .from("game_messages")
    .update({
      is_pinned: parsed.data.pinned,
      pinned_by: parsed.data.pinned ? access.current.profile.id : null,
    })
    .eq("id", parsed.data.message_id)
    .eq("game_id", gameId)
    .select(gameMessageSelect)
    .single();
  if (updated.error) throw updated.error;
  return json(
    serializeGameMessage(updated.data, access.current, access.canModerate),
  );
}

const socialProfileSelect =
  "id,username,first_name,last_name,avatar_url,role,reputation";

function friendshipStatus(
  records: any[],
  currentProfileId: number,
  otherProfileId: number,
): "none" | "incoming" | "outgoing" | "accepted" {
  const record = records.find(
    (item) =>
      (Number(item.requester_id) === currentProfileId &&
        Number(item.addressee_id) === otherProfileId) ||
      (Number(item.addressee_id) === currentProfileId &&
        Number(item.requester_id) === otherProfileId),
  );
  if (!record) return "none";
  if (record.status === "accepted") return "accepted";
  return Number(record.requester_id) === currentProfileId
    ? "outgoing"
    : "incoming";
}

function serializeFriendship(record: any, currentProfileId: number) {
  const incoming = Number(record.addressee_id) === currentProfileId;
  return {
    id: Number(record.id),
    status: record.status,
    direction: incoming ? "incoming" : "outgoing",
    user: publicUser(incoming ? record.requester : record.addressee),
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function serializeTeam(record: any, membership: any) {
  const activeMembers = (record.members ?? []).filter(
    (item: any) => item.status === "active",
  );
  return {
    id: Number(record.id),
    name: record.name,
    description: record.description ?? "",
    owner: publicUser(record.owner),
    my_role: membership.role,
    my_status: membership.status,
    members_count: activeMembers.length,
    members: (record.members ?? [])
      .map((item: any) => ({
        user: publicUser(item.profile),
        role: item.role,
        status: item.status,
        joined_at: item.joined_at,
      }))
      .filter((item: any) => item.user),
    created_at: record.created_at,
  };
}

async function teamForProfile(teamId: number, profileId: number) {
  const service = createServiceClient();
  const membership = await service
    .from("team_members")
    .select("team_id,user_id,role,status")
    .eq("team_id", teamId)
    .eq("user_id", profileId)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (!membership.data) throw new HttpError(404, "Команда не найдена");
  const team = await service
    .from("teams")
    .select(
      `*,owner:profiles!teams_owner_id_fkey(${socialProfileSelect}),members:team_members(team_id,user_id,role,status,joined_at,profile:profiles!team_members_user_id_fkey(${socialProfileSelect}))`,
    )
    .eq("id", teamId)
    .maybeSingle();
  if (team.error) throw team.error;
  if (!team.data) throw new HttpError(404, "Команда не найдена");
  return serializeTeam(team.data, membership.data);
}

async function socialOverviewData(profileId: number) {
  const service = createServiceClient();
  const relationships = await service
    .from("friendships")
    .select(
      `*,requester:profiles!friendships_requester_id_fkey(${socialProfileSelect}),addressee:profiles!friendships_addressee_id_fkey(${socialProfileSelect})`,
    )
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`)
    .order("updated_at", { ascending: false });
  if (relationships.error) throw relationships.error;
  const friendshipRecords = relationships.data ?? [];
  const serializedRelationships = friendshipRecords
    .map((record) => serializeFriendship(record, profileId))
    .filter((record) => record.user);

  const memberships = await service
    .from("team_members")
    .select("team_id,user_id,role,status,created_at")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false });
  if (memberships.error) throw memberships.error;
  const membershipRecords = memberships.data ?? [];
  const teamIds = membershipRecords.map((item) => Number(item.team_id));
  let teams: any[] = [];
  if (teamIds.length) {
    const teamRecords = await service
      .from("teams")
      .select(
        `*,owner:profiles!teams_owner_id_fkey(${socialProfileSelect}),members:team_members(team_id,user_id,role,status,joined_at,profile:profiles!team_members_user_id_fkey(${socialProfileSelect}))`,
      )
      .in("id", teamIds);
    if (teamRecords.error) throw teamRecords.error;
    const membershipByTeam = new Map(
      membershipRecords.map((item) => [Number(item.team_id), item]),
    );
    teams = (teamRecords.data ?? [])
      .map((team) => serializeTeam(team, membershipByTeam.get(Number(team.id))))
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }

  const invitations = await service
    .from("game_invitations")
    .select(
      `id,status,created_at,game:games!game_invitations_game_id_fkey(id,title,starts_at,status,court:courts!games_court_id_fkey(name)),inviter:profiles!game_invitations_inviter_id_fkey(${socialProfileSelect}),team:teams!game_invitations_team_id_fkey(id,name)`,
    )
    .eq("invitee_id", profileId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (invitations.error) throw invitations.error;
  const gameInvitations = (invitations.data ?? [])
    .filter(
      (record: any) =>
        record.game &&
        record.game.status === "scheduled" &&
        Date.parse(record.game.starts_at) > Date.now(),
    )
    .map((record: any) => ({
      id: Number(record.id),
      status: record.status,
      created_at: record.created_at,
      game: {
        id: Number(record.game.id),
        title: record.game.title,
        starts_at: record.game.starts_at,
        court_name: record.game.court?.name ?? "",
      },
      inviter: publicUser(record.inviter),
      team: record.team
        ? { id: Number(record.team.id), name: record.team.name }
        : null,
    }));

  const myGames = await service
    .from("game_participants")
    .select("game_id,game:games!game_participants_game_id_fkey(starts_at)")
    .eq("user_id", profileId)
    .eq("status", "joined")
    .order("joined_at", { ascending: false })
    .limit(30);
  if (myGames.error) throw myGames.error;
  const pastGameIds = (myGames.data ?? [])
    .filter(
      (item: any) =>
        item.game?.starts_at && Date.parse(item.game.starts_at) <= Date.now(),
    )
    .map((item) => Number(item.game_id));
  const recentByProfile = new Map<
    number,
    { profile: any; last_played_at: string; games_together: number }
  >();
  if (pastGameIds.length) {
    const participants = await service
      .from("game_participants")
      .select(
        `user_id,status,profile:profiles!game_participants_user_id_fkey(${socialProfileSelect}),game:games!game_participants_game_id_fkey(id,starts_at)`,
      )
      .in("game_id", pastGameIds)
      .eq("status", "joined");
    if (participants.error) throw participants.error;
    for (const item of participants.data ?? []) {
      const otherId = Number(item.user_id);
      if (otherId === profileId || !item.profile || !item.game) continue;
      const existing = recentByProfile.get(otherId);
      const playedAt = (item.game as any).starts_at;
      recentByProfile.set(otherId, {
        profile: item.profile,
        last_played_at:
          !existing ||
          Date.parse(playedAt) > Date.parse(existing.last_played_at)
            ? playedAt
            : existing.last_played_at,
        games_together: (existing?.games_together ?? 0) + 1,
      });
    }
  }
  const recentPlayers = Array.from(recentByProfile.entries())
    .map(([otherId, item]) => ({
      ...publicUser(item.profile),
      last_played_at: item.last_played_at,
      games_together: item.games_together,
      friendship_status: friendshipStatus(
        friendshipRecords,
        profileId,
        otherId,
      ),
    }))
    .sort(
      (left, right) =>
        Date.parse(right.last_played_at) - Date.parse(left.last_played_at),
    )
    .slice(0, 12);

  return {
    friends: serializedRelationships.filter(
      (record) => record.status === "accepted",
    ),
    incoming_requests: serializedRelationships.filter(
      (record) =>
        record.status === "pending" && record.direction === "incoming",
    ),
    outgoing_requests: serializedRelationships.filter(
      (record) =>
        record.status === "pending" && record.direction === "outgoing",
    ),
    teams,
    game_invitations: gameInvitations,
    recent_players: recentPlayers,
  };
}

async function socialOverview(request: NextRequest) {
  const current = await identity(request, true);
  return json(await socialOverviewData(current!.profile.id));
}

async function searchSocialProfiles(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(request, "social-search", 120, 3600, current!.profile.id);
  const parsed = z
    .string()
    .trim()
    .min(2)
    .max(50)
    .safeParse(request.nextUrl.searchParams.get("q") ?? "");
  if (!parsed.success) throw new HttpError(400, "Введите минимум 2 символа");
  const query = parsed.data.replace(/[%_]/g, "");
  if (query.length < 2) throw new HttpError(400, "Некорректный поиск");
  const service = createServiceClient();
  const fields = ["username", "first_name", "last_name"] as const;
  const searches = await Promise.all(
    fields.map((field) =>
      service
        .from("profiles")
        .select(socialProfileSelect)
        .ilike(field, `%${query}%`)
        .neq("id", current!.profile.id)
        .limit(12),
    ),
  );
  const byId = new Map<number, any>();
  for (const result of searches) {
    if (result.error) throw result.error;
    for (const profile of result.data ?? []) {
      byId.set(Number(profile.id), profile);
    }
  }
  const profileIds = Array.from(byId.keys());
  let relationships: any[] = [];
  if (profileIds.length) {
    const result = await service
      .from("friendships")
      .select("*")
      .or(
        `and(requester_id.eq.${current!.profile.id},addressee_id.in.(${profileIds.join(",")})),and(addressee_id.eq.${current!.profile.id},requester_id.in.(${profileIds.join(",")}))`,
      );
    if (result.error) throw result.error;
    relationships = result.data ?? [];
  }
  return json(
    Array.from(byId.entries())
      .map(([profileId, profile]) => ({
        ...publicUser(profile),
        friendship_status: friendshipStatus(
          relationships,
          current!.profile.id,
          profileId,
        ),
      }))
      .sort((left, right) => {
        const leftName =
          `${left.first_name ?? ""} ${left.last_name ?? ""}`.trim() ||
          left.username ||
          "";
        const rightName =
          `${right.first_name ?? ""} ${right.last_name ?? ""}`.trim() ||
          right.username ||
          "";
        return leftName.localeCompare(rightName, "ru");
      })
      .slice(0, 20),
  );
}

async function requestFriendship(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(request, "friend-request", 30, 3600, current!.profile.id);
  const parsed = z
    .object({ user_id: z.number().int().positive() })
    .safeParse(await body(request));
  if (!parsed.success) throw new HttpError(400, "Некорректный пользователь");
  const targetId = parsed.data.user_id;
  if (targetId === current!.profile.id)
    throw new HttpError(400, "Нельзя добавить в друзья самого себя");
  const service = createServiceClient();
  const target = await service
    .from("profiles")
    .select(socialProfileSelect)
    .eq("id", targetId)
    .maybeSingle();
  if (target.error) throw target.error;
  if (!target.data) throw new HttpError(404, "Пользователь не найден");
  const existing = await service
    .from("friendships")
    .select("*")
    .or(
      `and(requester_id.eq.${current!.profile.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${current!.profile.id})`,
    )
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === "accepted")
    throw new HttpError(409, "Пользователь уже в друзьях");
  if (
    existing.data?.status === "pending" &&
    Number(existing.data.addressee_id) === current!.profile.id
  ) {
    const accepted = await service
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", existing.data.id);
    if (accepted.error) throw accepted.error;
  } else if (existing.data) {
    throw new HttpError(409, "Заявка уже отправлена");
  } else {
    const created = await service.from("friendships").insert({
      requester_id: current!.profile.id,
      addressee_id: targetId,
      status: "pending",
    });
    if (created.error) throw created.error;
    const sender = profileDisplayName(current!.profile);
    await notifyGameProfiles(
      [targetId],
      `🏀 ${sender} хочет добавить вас в друзья в HOOPMAP.`,
      "Новая заявка в друзья",
      `${sender} хочет добавить вас в друзья`,
      "/community",
      `friend-request-${current!.profile.id}-${targetId}`,
    );
  }
  return json(await socialOverviewData(current!.profile.id));
}

async function respondToFriendship(
  request: NextRequest,
  friendshipId: number,
  action: "accept" | "decline",
) {
  const current = await identity(request, true);
  await rateLimit(request, "friend-response", 60, 3600, current!.profile.id);
  const service = createServiceClient();
  const relationship = await service
    .from("friendships")
    .select("*")
    .eq("id", friendshipId)
    .maybeSingle();
  if (relationship.error) throw relationship.error;
  if (
    !relationship.data ||
    relationship.data.status !== "pending" ||
    Number(relationship.data.addressee_id) !== current!.profile.id
  ) {
    throw new HttpError(404, "Заявка не найдена");
  }
  const result =
    action === "accept"
      ? await service
          .from("friendships")
          .update({ status: "accepted" })
          .eq("id", friendshipId)
      : await service.from("friendships").delete().eq("id", friendshipId);
  if (result.error) throw result.error;
  if (action === "accept") {
    const name = profileDisplayName(current!.profile);
    await notifyGameProfiles(
      [Number(relationship.data.requester_id)],
      `🙌 ${name} принял вашу заявку в друзья.`,
      "Заявка принята",
      `${name} теперь у вас в друзьях`,
      "/community",
      `friend-accepted-${friendshipId}`,
    );
  }
  return json(await socialOverviewData(current!.profile.id));
}

async function removeFriendship(request: NextRequest, friendshipId: number) {
  const current = await identity(request, true);
  const service = createServiceClient();
  const relationship = await service
    .from("friendships")
    .select("id,requester_id,addressee_id")
    .eq("id", friendshipId)
    .maybeSingle();
  if (relationship.error) throw relationship.error;
  if (
    !relationship.data ||
    ![
      Number(relationship.data.requester_id),
      Number(relationship.data.addressee_id),
    ].includes(current!.profile.id)
  ) {
    throw new HttpError(404, "Связь не найдена");
  }
  const removed = await service
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (removed.error) throw removed.error;
  return json(await socialOverviewData(current!.profile.id));
}

const teamInput = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).default(""),
});

async function createTeam(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(request, "team-create", 10, 86400, current!.profile.id);
  const parsed = teamInput.safeParse(await body(request));
  if (!parsed.success)
    throw new HttpError(400, "Проверьте название и описание команды");
  const service = createServiceClient();
  const created = await service
    .from("teams")
    .insert({ owner_id: current!.profile.id, ...parsed.data })
    .select("id")
    .single();
  if (created.error) throw created.error;
  const membership = await service.from("team_members").insert({
    team_id: created.data.id,
    user_id: current!.profile.id,
    role: "owner",
    status: "active",
    invited_by: current!.profile.id,
    joined_at: new Date().toISOString(),
  });
  if (membership.error) {
    await service.from("teams").delete().eq("id", created.data.id);
    throw membership.error;
  }
  return json(
    await teamForProfile(Number(created.data.id), current!.profile.id),
  );
}

async function oneTeam(request: NextRequest, teamId: number) {
  const current = await identity(request, true);
  return json(await teamForProfile(teamId, current!.profile.id));
}

async function inviteToTeam(request: NextRequest, teamId: number) {
  const current = await identity(request, true);
  await rateLimit(request, "team-invite", 60, 3600, current!.profile.id);
  const parsed = z
    .object({ user_id: z.number().int().positive() })
    .safeParse(await body(request));
  if (!parsed.success) throw new HttpError(400, "Некорректный пользователь");
  const targetId = parsed.data.user_id;
  if (targetId === current!.profile.id)
    throw new HttpError(400, "Вы уже в команде");
  const service = createServiceClient();
  const membership = await service
    .from("team_members")
    .select("role,status")
    .eq("team_id", teamId)
    .eq("user_id", current!.profile.id)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (
    !membership.data ||
    membership.data.status !== "active" ||
    !["owner", "admin"].includes(membership.data.role)
  ) {
    throw new HttpError(403, "Приглашать может владелец или администратор");
  }
  const friendship = await service
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${current!.profile.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${current!.profile.id})`,
    )
    .maybeSingle();
  if (friendship.error) throw friendship.error;
  if (!friendship.data)
    throw new HttpError(409, "Сначала добавьте игрока в друзья");
  const existing = await service
    .from("team_members")
    .select("status")
    .eq("team_id", teamId)
    .eq("user_id", targetId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data)
    throw new HttpError(
      409,
      existing.data.status === "active"
        ? "Игрок уже в команде"
        : "Приглашение уже отправлено",
    );
  const invited = await service.from("team_members").insert({
    team_id: teamId,
    user_id: targetId,
    role: "member",
    status: "invited",
    invited_by: current!.profile.id,
  });
  if (invited.error) throw invited.error;
  const team = await service
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .single();
  if (team.error) throw team.error;
  await notifyGameProfiles(
    [targetId],
    `🏀 Вас пригласили в команду «${team.data.name}».`,
    "Приглашение в команду",
    `Вас пригласили в «${team.data.name}»`,
    "/community",
    `team-invite-${teamId}-${targetId}`,
  );
  return json(await teamForProfile(teamId, current!.profile.id));
}

async function respondToTeamInvitation(
  request: NextRequest,
  teamId: number,
  action: "accept" | "decline",
) {
  const current = await identity(request, true);
  const service = createServiceClient();
  const membership = await service
    .from("team_members")
    .select("status")
    .eq("team_id", teamId)
    .eq("user_id", current!.profile.id)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (!membership.data || membership.data.status !== "invited")
    throw new HttpError(404, "Приглашение не найдено");
  const result =
    action === "accept"
      ? await service
          .from("team_members")
          .update({ status: "active", joined_at: new Date().toISOString() })
          .eq("team_id", teamId)
          .eq("user_id", current!.profile.id)
      : await service
          .from("team_members")
          .delete()
          .eq("team_id", teamId)
          .eq("user_id", current!.profile.id);
  if (result.error) throw result.error;
  return json(await socialOverviewData(current!.profile.id));
}

async function leaveTeam(request: NextRequest, teamId: number) {
  const current = await identity(request, true);
  const service = createServiceClient();
  const membership = await service
    .from("team_members")
    .select("role,status")
    .eq("team_id", teamId)
    .eq("user_id", current!.profile.id)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (!membership.data) throw new HttpError(404, "Команда не найдена");
  if (membership.data.role === "owner")
    throw new HttpError(409, "Владелец не может покинуть команду");
  const removed = await service
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", current!.profile.id);
  if (removed.error) throw removed.error;
  return json(await socialOverviewData(current!.profile.id));
}

async function removeTeamMember(request: NextRequest, teamId: number) {
  const current = await identity(request, true);
  const parsed = z
    .object({ user_id: z.number().int().positive() })
    .safeParse(await body(request));
  if (!parsed.success) throw new HttpError(400, "Некорректный участник");
  const service = createServiceClient();
  const [actor, target] = await Promise.all([
    service
      .from("team_members")
      .select("role,status")
      .eq("team_id", teamId)
      .eq("user_id", current!.profile.id)
      .maybeSingle(),
    service
      .from("team_members")
      .select("role,status")
      .eq("team_id", teamId)
      .eq("user_id", parsed.data.user_id)
      .maybeSingle(),
  ]);
  if (actor.error) throw actor.error;
  if (target.error) throw target.error;
  if (
    !actor.data ||
    actor.data.status !== "active" ||
    !["owner", "admin"].includes(actor.data.role)
  ) {
    throw new HttpError(403, "Недостаточно прав");
  }
  if (!target.data) throw new HttpError(404, "Участник не найден");
  if (
    target.data.role === "owner" ||
    (actor.data.role === "admin" && target.data.role === "admin")
  ) {
    throw new HttpError(403, "Этого участника может удалить только владелец");
  }
  const removed = await service
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", parsed.data.user_id);
  if (removed.error) throw removed.error;
  return json(await teamForProfile(teamId, current!.profile.id));
}

async function inviteToGame(request: NextRequest, gameId: number) {
  const current = await identity(request, true);
  await rateLimit(request, "game-invite", 100, 3600, current!.profile.id);
  const parsed = z
    .object({
      user_ids: z.array(z.number().int().positive()).max(50).optional(),
      team_id: z.number().int().positive().optional(),
    })
    .refine(
      (value) => Boolean(value.team_id) !== Boolean(value.user_ids?.length),
      "Выберите игроков или команду",
    )
    .safeParse(await body(request));
  if (!parsed.success) throw new HttpError(400, "Выберите друзей или команду");
  const service = createServiceClient();
  const game = await service
    .from("games")
    .select("id,title,creator_id,status,starts_at")
    .eq("id", gameId)
    .maybeSingle();
  if (game.error) throw game.error;
  if (!game.data) throw new HttpError(404, "Игра не найдена");
  if (Number(game.data.creator_id) !== current!.profile.id)
    throw new HttpError(403, "Приглашать может только организатор");
  if (
    game.data.status !== "scheduled" ||
    Date.parse(game.data.starts_at) <= Date.now()
  ) {
    throw new HttpError(409, "В эту игру уже нельзя приглашать");
  }

  let targetIds = Array.from(new Set(parsed.data.user_ids ?? []));
  let sourceTeamId: number | null = null;
  if (parsed.data.team_id) {
    sourceTeamId = parsed.data.team_id;
    const myMembership = await service
      .from("team_members")
      .select("status")
      .eq("team_id", sourceTeamId)
      .eq("user_id", current!.profile.id)
      .eq("status", "active")
      .maybeSingle();
    if (myMembership.error) throw myMembership.error;
    if (!myMembership.data)
      throw new HttpError(403, "Можно приглашать только свою команду");
    const members = await service
      .from("team_members")
      .select("user_id")
      .eq("team_id", sourceTeamId)
      .eq("status", "active");
    if (members.error) throw members.error;
    targetIds = (members.data ?? []).map((item) => Number(item.user_id));
  } else if (targetIds.length) {
    const friendships = await service
      .from("friendships")
      .select("requester_id,addressee_id")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${current!.profile.id},addressee_id.in.(${targetIds.join(",")})),and(addressee_id.eq.${current!.profile.id},requester_id.in.(${targetIds.join(",")}))`,
      );
    if (friendships.error) throw friendships.error;
    const allowed = new Set<number>();
    for (const friendship of friendships.data ?? []) {
      allowed.add(
        Number(friendship.requester_id) === current!.profile.id
          ? Number(friendship.addressee_id)
          : Number(friendship.requester_id),
      );
    }
    targetIds = targetIds.filter((profileId) => allowed.has(profileId));
  }
  targetIds = targetIds.filter(
    (profileId) => profileId !== current!.profile.id,
  );
  if (!targetIds.length) throw new HttpError(409, "Некого приглашать");
  const participants = await service
    .from("game_participants")
    .select("user_id")
    .eq("game_id", gameId)
    .eq("status", "joined");
  if (participants.error) throw participants.error;
  const joined = new Set(
    (participants.data ?? []).map((item) => Number(item.user_id)),
  );
  targetIds = targetIds.filter((profileId) => !joined.has(profileId));
  if (!targetIds.length) throw new HttpError(409, "Все уже участвуют в игре");
  const invitationRows = targetIds.map((profileId) => ({
    game_id: gameId,
    inviter_id: current!.profile.id,
    invitee_id: profileId,
    team_id: sourceTeamId,
    status: "pending",
    responded_at: null,
  }));
  const inserted = await service
    .from("game_invitations")
    .upsert(invitationRows, { onConflict: "game_id,invitee_id" });
  if (inserted.error) throw inserted.error;
  const sender = profileDisplayName(current!.profile);
  await notifyGameProfiles(
    targetIds,
    `🏀 ${sender} приглашает вас на игру «${game.data.title}».`,
    "Приглашение на игру",
    `${sender} приглашает на «${game.data.title}»`,
    `/games/${gameId}`,
    `game-${gameId}-invitation`,
  );
  return json({ invited: targetIds.length });
}

async function respondToGameInvitation(request: NextRequest, gameId: number) {
  const current = await identity(request, true);
  const parsed = z
    .object({ action: z.enum(["accept", "decline"]) })
    .safeParse(await body(request));
  if (!parsed.success) throw new HttpError(400, "Некорректное действие");
  const service = createServiceClient();
  const invitation = await service
    .from("game_invitations")
    .select(
      "id,status,inviter_id,game:games!game_invitations_game_id_fkey(title)",
    )
    .eq("game_id", gameId)
    .eq("invitee_id", current!.profile.id)
    .eq("status", "pending")
    .maybeSingle();
  if (invitation.error) throw invitation.error;
  if (!invitation.data) throw new HttpError(404, "Приглашение не найдено");
  if (parsed.data.action === "decline") {
    const declined = await service
      .from("game_invitations")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", invitation.data.id);
    if (declined.error) throw declined.error;
    return oneGame(request, gameId);
  }
  const joined = await current!.client.rpc("join_game", {
    target_game_id: gameId,
  });
  if (joined.error) {
    const message = joined.error.message;
    if (message.includes("Game is full"))
      throw new HttpError(409, "В игре больше нет свободных мест");
    if (message.includes("Already joined")) {
      // The invitation can still be marked accepted after a direct join.
    } else if (message.includes("Game cannot be joined")) {
      throw new HttpError(409, "К этой игре уже нельзя присоединиться");
    } else {
      throw joined.error;
    }
  }
  const accepted = await service
    .from("game_invitations")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", invitation.data.id);
  if (accepted.error) throw accepted.error;
  const playerName = profileDisplayName(current!.profile);
  const gameTitle = (invitation.data.game as any)?.title ?? "игру";
  await notifyGameProfiles(
    [Number(invitation.data.inviter_id)],
    `🙌 ${playerName} принял приглашение на «${gameTitle}».`,
    "Приглашение принято",
    `${playerName} присоединился к игре`,
    `/games/${gameId}`,
    `game-${gameId}-invite-accepted-${current!.profile.id}`,
  );
  return oneGame(request, gameId);
}

async function authTelegram(request: NextRequest) {
  await rateLimit(request, "telegram-auth", 20, 900);
  const parsed = z
    .object({ init_data: z.string().min(1).max(8192) })
    .safeParse(await body(request));
  if (!parsed.success) throw new HttpError(400, "Некорректные данные Telegram");
  const profile = await ensureTelegramUser(
    validateTelegramInitData(parsed.data.init_data),
  );
  const session = await createTelegramSession(profile);
  const response = json({
    access: session.access_token,
    user: privateUser(profile, session.user),
  });
  response.cookies.set(
    refreshCookieName(),
    session.refresh_token,
    refreshCookieOptions(),
  );
  return response;
}

async function startGoogleLogin(request: NextRequest) {
  await rateLimit(request, "google-oauth-start", 20, 900);
  const next = safeOAuthNext(request.nextUrl.searchParams.get("next"));
  const attempt = createPkceRequestClient();
  const started = await attempt.client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: googleCallbackUrl(request),
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });
  const verifier = attempt.getCodeVerifier();
  if (
    started.error ||
    !started.data.url ||
    !isValidGooglePkceVerifier(verifier)
  ) {
    throw started.error ?? new Error("Could not start Google OAuth");
  }
  const authorizationUrl = new URL(started.data.url);
  const expectedOrigin = new URL(supabaseUrl()).origin;
  if (
    authorizationUrl.origin !== expectedOrigin ||
    !authorizationUrl.pathname.endsWith("/auth/v1/authorize")
  ) {
    throw new Error("Unexpected Supabase authorization URL");
  }

  const response = NextResponse.redirect(authorizationUrl);
  const options = googleOAuthCookieOptions();
  response.cookies.set(googleOAuthCookies.verifier, verifier, options);
  response.cookies.set(googleOAuthCookies.next, next, options);
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
  authUser: Parameters<typeof privateUser>[1],
) {
  const response = json({
    access: accessToken,
    user: privateUser(profile, authUser),
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
    authUser,
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
    signedIn.data.user,
  );
}

async function requestPasswordReset(request: NextRequest) {
  await rateLimit(request, "password-reset-request", 5, 3600);
  const parsed = passwordResetRequestSchema.safeParse(await body(request));
  if (!parsed.success) {
    throw new HttpError(400, "Введите корректный email");
  }

  const attempt = createPkceRequestClient();
  const requested = await attempt.client.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: passwordRecoveryUrl(request) },
  );
  const verifier = attempt.getCodeVerifier();
  if (requested.error) {
    console.error("Password reset request could not be sent");
  }
  const response = json(
    {
      message:
        "Если такой аккаунт существует, мы отправили письмо для смены пароля.",
    },
    202,
  );
  if (!requested.error && isValidRecoveryPkceVerifier(verifier)) {
    response.cookies.set(
      passwordRecoveryCookies.verifier,
      verifier,
      passwordRecoveryCookieOptions(),
    );
  }
  return response;
}

async function updateRecoveredPassword(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(request, "password-update", 5, 3600, current!.profile.id);
  const proof = request.cookies.get(passwordRecoveryCookies.proof)?.value ?? "";
  if (!verifyPasswordRecoveryProof(proof, current!.authUser.id)) {
    throw new HttpError(
      403,
      "Ссылка для смены пароля недействительна или истекла",
    );
  }
  const parsed = passwordUpdateSchema.safeParse(await body(request));
  if (!parsed.success) {
    throw new HttpError(
      400,
      parsed.error.issues[0]?.message ?? "Проверьте новый пароль",
    );
  }
  const updated = await current!.client.auth.updateUser({
    password: parsed.data.password,
  });
  if (updated.error) {
    throw new HttpError(400, "Не удалось установить новый пароль");
  }
  const response = empty();
  response.cookies.set(passwordRecoveryCookies.proof, "", {
    ...passwordRecoveryCookieOptions(),
    maxAge: 0,
  });
  return response;
}

async function createTelegramAccountLink(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(
    request,
    "telegram-account-link",
    5,
    3600,
    current!.profile.id,
  );
  if (current!.profile.telegram_id) {
    throw new HttpError(409, "Telegram уже подключён к этому профилю");
  }
  return json(await issueTelegramAccountLink(current!.profile), 201);
}

async function authRefresh(request: NextRequest) {
  const refreshToken = request.cookies.get(refreshCookieName())?.value;
  if (!refreshToken) throw new HttpError(401, "Сессия не найдена");
  const refreshed = await createRequestClient().auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (refreshed.error || !refreshed.data.session)
    throw new HttpError(401, "Сессия истекла");
  const response = json({ access: refreshed.data.session.access_token });
  response.cookies.set(
    refreshCookieName(),
    refreshed.data.session.refresh_token,
    refreshCookieOptions(),
  );
  return response;
}

function authLogout() {
  const response = empty();
  response.cookies.set(refreshCookieName(), "", {
    ...refreshCookieOptions(),
    maxAge: 0,
  });
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
  return json(privateUser(updated.data, current!.authUser));
}

const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(4096)
    .refine((value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }, "Push endpoint must use HTTPS"),
  keys: z.object({
    p256dh: z
      .string()
      .min(20)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/),
    auth: z
      .string()
      .min(8)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/),
  }),
});

const notificationPreferencesSchema = z
  .object({
    game_updates: z.boolean().optional(),
    game_reminders: z.boolean().optional(),
    reminder_24h: z.boolean().optional(),
    reminder_2h: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

const defaultNotificationPreferences = {
  game_updates: true,
  game_reminders: true,
  reminder_24h: true,
  reminder_2h: true,
} as const;

async function notificationSettings(request: NextRequest) {
  const current = await identity(request, true);
  const admin = createServiceClient();
  const [preferences, subscriptions] = await Promise.all([
    admin
      .from("notification_preferences")
      .select("game_updates,game_reminders,reminder_24h,reminder_2h")
      .eq("user_id", current!.profile.id)
      .maybeSingle(),
    admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", current!.profile.id),
  ]);
  if (preferences.error) throw preferences.error;
  if (subscriptions.error) throw subscriptions.error;
  return json({
    ...defaultNotificationPreferences,
    ...(preferences.data ?? {}),
    subscriptions_count: subscriptions.count ?? 0,
    server_configured: webPushConfigured(),
  });
}

async function subscribeToPush(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(request, "push-subscribe", 20, 3600, current!.profile.id);
  if (!webPushConfigured()) {
    throw new HttpError(503, "Push-уведомления ещё не настроены на сервере");
  }
  const input = pushSubscriptionSchema.safeParse(await body(request));
  if (!input.success) throw new HttpError(400, "Некорректная push-подписка");
  const admin = createServiceClient();
  const subscription = await admin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: current!.profile.id,
        endpoint: input.data.endpoint,
        p256dh: input.data.keys.p256dh,
        auth: input.data.keys.auth,
        user_agent: (request.headers.get("user-agent") ?? "").slice(0, 500),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    )
    .select("id")
    .single();
  if (subscription.error) throw subscription.error;
  const preferences = await admin.from("notification_preferences").upsert(
    {
      user_id: current!.profile.id,
      ...defaultNotificationPreferences,
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (preferences.error) throw preferences.error;
  return notificationSettings(request);
}

async function unsubscribeFromPush(request: NextRequest) {
  const current = await identity(request, true);
  const input = z
    .object({ endpoint: z.string().url().max(4096) })
    .safeParse(await body(request));
  if (!input.success) throw new HttpError(400, "Некорректная push-подписка");
  const removed = await createServiceClient()
    .from("push_subscriptions")
    .delete()
    .eq("user_id", current!.profile.id)
    .eq("endpoint", input.data.endpoint);
  if (removed.error) throw removed.error;
  return notificationSettings(request);
}

async function updateNotificationSettings(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(
    request,
    "notification-settings",
    30,
    3600,
    current!.profile.id,
  );
  const input = notificationPreferencesSchema.safeParse(await body(request));
  if (!input.success) throw new HttpError(400, "Некорректные настройки");
  const updated = await createServiceClient()
    .from("notification_preferences")
    .upsert(
      { user_id: current!.profile.id, ...input.data },
      { onConflict: "user_id" },
    );
  if (updated.error) throw updated.error;
  return notificationSettings(request);
}

async function sendTestPush(request: NextRequest) {
  const current = await identity(request, true);
  await rateLimit(request, "push-test", 3, 3600, current!.profile.id);
  if (!webPushConfigured()) {
    throw new HttpError(503, "Push-уведомления ещё не настроены на сервере");
  }
  const results = await notifyProfilesInWebPush([current!.profile.id], {
    title: "HOOPMAP готов 🏀",
    body: "Уведомления подключены. Здесь появятся напоминания об играх.",
    url: "/profile",
    tag: `push-test-${current!.profile.id}`,
  });
  const result = results[0];
  if (!result?.subscriptions) {
    throw new HttpError(409, "На этом профиле нет активной подписки");
  }
  if (!result.delivered && result.retryableFailures) {
    throw new HttpError(502, "Не удалось доставить тестовое уведомление");
  }
  return json({ delivered: result.delivered });
}

const telegramOidcCookies = {
  state: "hoopmap_tg_oidc_state",
  nonce: "hoopmap_tg_oidc_nonce",
  verifier: "hoopmap_tg_oidc_verifier",
  next: "hoopmap_tg_oidc_next",
} as const;

const telegramWidgetCookies = {
  state: "hoopmap_tg_widget_state",
  next: "hoopmap_tg_widget_next",
} as const;

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value.slice(0, 500)
    : "/profile";
}

function secureStringEqual(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return (
    left.length === right.length &&
    left.length > 0 &&
    timingSafeEqual(left, right)
  );
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

function telegramBotUsername(): string {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (
    !username ||
    !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ||
    !username.toLowerCase().endsWith("bot")
  ) {
    throw new Error("TELEGRAM_BOT_USERNAME is not configured");
  }
  return username;
}

function telegramWebBaseUrl(request: NextRequest): URL {
  const configured =
    process.env.SITE_URL?.trim() ||
    process.env.TELEGRAM_WEBAPP_URL?.trim() ||
    request.nextUrl.origin;
  const base = new URL(configured);
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)
    )
  ) {
    throw new Error("Telegram web login requires HTTPS");
  }
  return base;
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

function clearTelegramWidgetCookies(response: NextResponse) {
  for (const name of Object.values(telegramWidgetCookies)) {
    response.cookies.set(name, "", {
      ...telegramOidcCookieOptions(),
      maxAge: 0,
    });
  }
}

async function telegramWidgetConfiguration(request: NextRequest) {
  await rateLimit(request, "telegram-widget-config", 30, 900);
  const state = randomBytes(32).toString("base64url");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const callback = new URL(
    "/api/v1/auth/telegram/widget-callback/",
    telegramWebBaseUrl(request),
  );
  callback.searchParams.set("state", state);

  const response = json({
    botUsername: telegramBotUsername(),
    authUrl: callback.toString(),
  });
  const options = telegramOidcCookieOptions();
  response.cookies.set(telegramWidgetCookies.state, state, options);
  response.cookies.set(telegramWidgetCookies.next, next, options);
  return response;
}

async function finishTelegramWidgetLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.nextUrl.origin);
  try {
    await rateLimit(request, "telegram-widget-callback", 30, 900);
    const receivedState = request.nextUrl.searchParams.get("state") ?? "";
    const expectedState =
      request.cookies.get(telegramWidgetCookies.state)?.value ?? "";
    if (!secureStringEqual(receivedState, expectedState)) {
      throw new Error("Invalid Telegram widget state");
    }

    const signedFields = new URLSearchParams();
    for (const key of [
      "id",
      "first_name",
      "last_name",
      "username",
      "photo_url",
      "auth_date",
      "hash",
    ]) {
      const values = request.nextUrl.searchParams.getAll(key);
      if (values.length > 1) throw new Error("Duplicate Telegram fields");
      if (values.length === 1) signedFields.set(key, values[0]);
    }
    const allowed = new Set([...signedFields.keys(), "state"]);
    if (
      Array.from(request.nextUrl.searchParams.keys()).some(
        (key) => !allowed.has(key),
      )
    ) {
      throw new Error("Unexpected Telegram callback field");
    }

    const identity = validateTelegramLoginWidgetData(signedFields);
    const profile = await ensureTelegramUser(identity);
    const session = await createTelegramSession(profile);
    const destination = new URL(
      safeNextPath(
        request.cookies.get(telegramWidgetCookies.next)?.value ?? "/profile",
      ),
      request.nextUrl.origin,
    );
    const response = NextResponse.redirect(destination);
    response.cookies.set(
      refreshCookieName(),
      session.refresh_token,
      refreshCookieOptions(),
    );
    clearTelegramWidgetCookies(response);
    return response;
  } catch (error) {
    console.error("Telegram widget login failed", error);
    loginUrl.searchParams.set("error", "telegram");
    const response = NextResponse.redirect(loginUrl);
    clearTelegramWidgetCookies(response);
    return response;
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

async function dispatch(
  request: NextRequest,
  segments: string[],
): Promise<NextResponse> {
  const [resource, lookup, action] = segments;
  if (resource === "auth") {
    if (lookup === "google" && action === "start" && request.method === "GET") {
      return startGoogleLogin(request);
    }
    if (lookup === "telegram" && request.method === "POST")
      return authTelegram(request);
    if (
      lookup === "telegram" &&
      action === "widget-config" &&
      request.method === "GET"
    ) {
      return telegramWidgetConfiguration(request);
    }
    if (
      lookup === "telegram" &&
      action === "widget-callback" &&
      request.method === "GET"
    ) {
      return finishTelegramWidgetLogin(request);
    }
    if (
      lookup === "telegram" &&
      action === "start" &&
      request.method === "GET"
    ) {
      return startTelegramWebLogin(request);
    }
    if (
      lookup === "telegram" &&
      action === "callback" &&
      request.method === "GET"
    ) {
      return finishTelegramWebLogin(request);
    }
    if (
      lookup === "email" &&
      action === "register" &&
      request.method === "POST"
    ) {
      return authEmailRegister(request);
    }
    if (lookup === "email" && action === "login" && request.method === "POST") {
      return authEmailLogin(request);
    }
    if (
      lookup === "password" &&
      action === "reset" &&
      request.method === "POST"
    ) {
      return requestPasswordReset(request);
    }
    if (
      lookup === "password" &&
      action === "update" &&
      request.method === "POST"
    ) {
      return updateRecoveredPassword(request);
    }
    if (lookup === "refresh" && request.method === "POST")
      return authRefresh(request);
    if (lookup === "logout" && request.method === "POST") return authLogout();
    if (lookup === "telegram-link" && request.method === "POST") {
      return createTelegramAccountLink(request);
    }
    if (lookup === "map-home" && request.method === "PATCH") {
      return updateMapHome(request);
    }
    if (lookup === "me" && request.method === "GET") {
      const current = await identity(request, true);
      return json(privateUser(current!.profile, current!.authUser));
    }
  }
  if (resource === "courts") {
    if (!lookup && request.method === "GET") return listCourts(request);
    if (!lookup && request.method === "POST") return createCourt(request);
    if (lookup === "nearby" && request.method === "GET")
      return nearbyCourts(request);
    if (lookup === "import" && request.method === "POST")
      return importCourts(request);
    if (lookup && !action && request.method === "GET") {
      const { client } = await clientFor(request);
      return json(serializeCourt(await oneCourt(client, lookup)));
    }
    const courtId = positiveInt(lookup);
    if (action === "photos" && request.method === "POST")
      return courtPhoto(request, courtId);
    if (action === "favorite" && ["POST", "DELETE"].includes(request.method)) {
      return favoriteCourt(request, courtId);
    }
    if (action === "verify" && request.method === "POST")
      return verifyCourt(request, courtId);
    if (action === "reviews" && request.method === "POST")
      return reviewCourt(request, courtId);
    if (action === "reports" && request.method === "POST")
      return reportCourt(request, courtId);
    if (action === "duplicates" && request.method === "GET")
      return duplicateCourts(request, courtId);
    if (action === "moderate" && request.method === "POST")
      return moderateCourt(request, courtId);
  }
  if (resource === "games") {
    if (!lookup && request.method === "GET") return listGames(request);
    if (!lookup && request.method === "POST") return createGame(request);
    const gameId = positiveInt(lookup);
    if (!action && request.method === "GET") return oneGame(request, gameId);
    if (!action && request.method === "PATCH")
      return updateGame(request, gameId);
    if (action === "join" && request.method === "POST")
      return gameMembership(request, gameId, "join");
    if (action === "leave" && request.method === "POST")
      return gameMembership(request, gameId, "leave");
    if (action === "cancel" && request.method === "POST")
      return cancelGame(request, gameId);
    if (action === "invite" && request.method === "POST")
      return inviteToGame(request, gameId);
    if (action === "invite-response" && request.method === "POST")
      return respondToGameInvitation(request, gameId);
    if (action === "messages" && request.method === "GET")
      return listGameMessages(request, gameId);
    if (action === "messages" && request.method === "POST")
      return sendGameMessage(request, gameId);
    if (action === "messages" && request.method === "DELETE")
      return deleteGameMessage(request, gameId);
    if (action === "messages" && request.method === "PATCH")
      return pinGameMessage(request, gameId);
  }
  if (resource === "social") {
    if (lookup === "overview" && request.method === "GET")
      return socialOverview(request);
    if (lookup === "search" && request.method === "GET")
      return searchSocialProfiles(request);
  }
  if (resource === "friends") {
    if (lookup === "requests" && request.method === "POST")
      return requestFriendship(request);
    const friendshipId = positiveInt(lookup, "friendship_id");
    if (!action && request.method === "DELETE")
      return removeFriendship(request, friendshipId);
    if (action === "accept" && request.method === "POST")
      return respondToFriendship(request, friendshipId, "accept");
    if (action === "decline" && request.method === "POST")
      return respondToFriendship(request, friendshipId, "decline");
  }
  if (resource === "teams") {
    if (!lookup && request.method === "POST") return createTeam(request);
    const teamId = positiveInt(lookup, "team_id");
    if (!action && request.method === "GET") return oneTeam(request, teamId);
    if (action === "invite" && request.method === "POST")
      return inviteToTeam(request, teamId);
    if (action === "accept" && request.method === "POST")
      return respondToTeamInvitation(request, teamId, "accept");
    if (action === "decline" && request.method === "POST")
      return respondToTeamInvitation(request, teamId, "decline");
    if (action === "leave" && request.method === "POST")
      return leaveTeam(request, teamId);
    if (action === "members" && request.method === "DELETE")
      return removeTeamMember(request, teamId);
  }
  if (resource === "notifications") {
    if (lookup === "settings" && request.method === "GET") {
      return notificationSettings(request);
    }
    if (lookup === "settings" && request.method === "PATCH") {
      return updateNotificationSettings(request);
    }
    if (lookup === "subscribe" && request.method === "POST") {
      return subscribeToPush(request);
    }
    if (lookup === "subscribe" && request.method === "DELETE") {
      return unsubscribeFromPush(request);
    }
    if (lookup === "test" && request.method === "POST") {
      return sendTestPush(request);
    }
  }
  throw new HttpError(404, "Маршрут не найден");
}

async function handler(request: NextRequest, context: RouteContext) {
  try {
    const { path = [] } = await context.params;
    return await dispatch(request, path.filter(Boolean));
  } catch (error) {
    if (error instanceof HttpError) {
      return json(
        { detail: error.message, errors: error.details },
        error.status,
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const duplicate =
      message.includes("duplicate key") ||
      message.includes("unique constraint");
    const auth =
      message.includes("JWT") || message.includes("Authentication required");
    console.error("API error", error);
    return json(
      {
        detail: auth
          ? "Требуется авторизация"
          : duplicate
            ? "Такая запись уже существует"
            : "Ошибка сервера",
      },
      auth ? 401 : duplicate ? 409 : 500,
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
