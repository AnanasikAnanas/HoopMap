import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyProfilesInWebPush, webPushConfigured } from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ClaimedReminder = {
  delivery_id: number | string;
  game_id: number | string;
  user_id: number | string;
  reminder_kind: "24h" | "2h";
  game_title: string;
  starts_at: string;
  court_name: string;
};

function secretMatches(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const received =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return (
    Boolean(expected) &&
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

function reminderKey(reminder: ClaimedReminder): string {
  return `${reminder.game_id}:${reminder.reminder_kind}`;
}

async function run(request: NextRequest) {
  if (!secretMatches(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!webPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Web Push is not configured" },
      { status: 503 },
    );
  }

  const admin = createServiceClient();
  const claimed = await admin.rpc("claim_game_reminders", {
    target_now: new Date().toISOString(),
  });
  if (claimed.error) {
    console.error("Could not claim game reminders");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const reminders = (claimed.data ?? []) as ClaimedReminder[];
  if (!reminders.length) {
    return NextResponse.json({ ok: true, claimed: 0, delivered: 0 });
  }

  const groups = new Map<string, ClaimedReminder[]>();
  for (const reminder of reminders) {
    const key = reminderKey(reminder);
    groups.set(key, [...(groups.get(key) ?? []), reminder]);
  }

  const deliveredIds: number[] = [];
  const retryIds: number[] = [];
  for (const group of groups.values()) {
    const sample = group[0];
    const label = sample.reminder_kind === "24h" ? "24 часа" : "2 часа";
    try {
      const results = await notifyProfilesInWebPush(
        group.map((item) => Number(item.user_id)),
        {
          title: `Игра через ${label} 🏀`,
          body: `«${sample.game_title}» · ${sample.court_name}`,
          url: `/games/${sample.game_id}`,
          tag: `game-${sample.game_id}-reminder-${sample.reminder_kind}`,
        },
      );
      const byProfile = new Map(
        results.map((result) => [result.profileId, result]),
      );
      for (const reminder of group) {
        const deliveryId = Number(reminder.delivery_id);
        const result = byProfile.get(Number(reminder.user_id));
        if (
          !result ||
          result.delivered > 0 ||
          result.subscriptions === 0 ||
          result.retryableFailures === 0
        ) {
          deliveredIds.push(deliveryId);
        } else {
          retryIds.push(deliveryId);
        }
      }
    } catch {
      retryIds.push(...group.map((item) => Number(item.delivery_id)));
    }
  }

  if (deliveredIds.length) {
    const delivered = await admin
      .from("game_reminder_deliveries")
      .update({
        delivered_at: new Date().toISOString(),
        last_error: "",
      })
      .in("id", deliveredIds);
    if (delivered.error) throw delivered.error;
  }
  if (retryIds.length) {
    const failed = await admin
      .from("game_reminder_deliveries")
      .update({ last_error: "Temporary Web Push delivery failure" })
      .in("id", retryIds);
    if (failed.error) throw failed.error;
  }

  return NextResponse.json(
    {
      ok: true,
      claimed: reminders.length,
      delivered: deliveredIds.length,
      retry: retryIds.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = run;
export const POST = run;
