import "server-only";
import webpush, {
  type PushSubscription as ServerPushSubscription,
} from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

export type WebPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export type WebPushDeliveryResult = {
  profileId: number;
  subscriptions: number;
  delivered: number;
  retryableFailures: number;
};

let configuredSignature = "";

function configuration() {
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  return { subject, publicKey, privateKey };
}

export function webPushConfigured(): boolean {
  const config = configuration();
  return Boolean(config.subject && config.publicKey && config.privateKey);
}

function configureWebPush(): void {
  const config = configuration();
  if (!config.subject || !config.publicKey || !config.privateKey) {
    throw new Error("Web Push is not configured");
  }
  const signature = `${config.subject}:${config.publicKey}:${config.privateKey}`;
  if (configuredSignature === signature) return;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  configuredSignature = signature;
}

function pushStatus(error: unknown): number {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return 0;
}

export async function notifyProfilesInWebPush(
  profileIds: number[],
  payload: WebPushPayload,
): Promise<WebPushDeliveryResult[]> {
  const ids = Array.from(
    new Set(
      profileIds.filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ).slice(0, 500);
  if (!ids.length) return [];
  configureWebPush();

  const admin = createServiceClient();
  const subscriptions = await admin
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .in("user_id", ids);
  if (subscriptions.error) throw subscriptions.error;

  const results = new Map<number, WebPushDeliveryResult>(
    ids.map((profileId) => [
      profileId,
      {
        profileId,
        subscriptions: 0,
        delivered: 0,
        retryableFailures: 0,
      },
    ]),
  );
  const expiredIds: number[] = [];
  const message = JSON.stringify({
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 500),
    url: payload.url.startsWith("/") ? payload.url.slice(0, 500) : "/games",
    tag: payload.tag.slice(0, 120),
  });

  await Promise.all(
    (subscriptions.data ?? []).map(async (record) => {
      const profileId = Number(record.user_id);
      const aggregate = results.get(profileId);
      if (!aggregate) return;
      aggregate.subscriptions += 1;
      const subscription: ServerPushSubscription = {
        endpoint: String(record.endpoint),
        keys: {
          p256dh: String(record.p256dh),
          auth: String(record.auth),
        },
      };
      try {
        await webpush.sendNotification(subscription, message, {
          TTL: 60 * 60 * 24,
          urgency: "normal",
          topic: payload.tag.slice(0, 32),
        });
        aggregate.delivered += 1;
      } catch (error) {
        const status = pushStatus(error);
        if (status === 404 || status === 410) {
          expiredIds.push(Number(record.id));
        } else {
          aggregate.retryableFailures += 1;
          console.error("Web Push delivery failed", {
            profileId,
            status,
          });
        }
      }
    }),
  );

  if (expiredIds.length) {
    const removed = await admin
      .from("push_subscriptions")
      .delete()
      .in("id", expiredIds);
    if (removed.error) {
      console.error("Failed to remove expired push subscriptions");
    }
  }
  return Array.from(results.values());
}
