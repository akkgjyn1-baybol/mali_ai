import { randomUUID } from "crypto";
import webpush, { type PushSubscription } from "web-push";
import { kvGet, kvSet } from "./redis";
import type { AppNotification, NotificationKind } from "./types";

const MAX_STORED = 100;

function notificationsKey(userId: string) {
  return `user:${userId}:notifications`;
}

function subscriptionsKey(userId: string) {
  return `user:${userId}:push_subscriptions`;
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

let vapidReady = false;

function ensureVapid() {
  if (vapidReady) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:mali@example.com",
    publicKey,
    privateKey,
  );
  vapidReady = true;
  return true;
}

export async function listNotifications(userId: string) {
  return (await kvGet<AppNotification[]>(notificationsKey(userId))) ?? [];
}

export async function unreadCount(userId: string) {
  return (await listNotifications(userId)).filter((n) => !n.read).length;
}

export async function markAllRead(userId: string) {
  const list = await listNotifications(userId);
  if (!list.some((n) => !n.read)) return list;
  const next = list.map((n) => ({ ...n, read: true }));
  await kvSet(notificationsKey(userId), next);
  return next;
}

export async function listSubscriptions(userId: string) {
  return (await kvGet<PushSubscription[]>(subscriptionsKey(userId))) ?? [];
}

export async function saveSubscription(userId: string, subscription: PushSubscription) {
  const list = await listSubscriptions(userId);
  const next = [subscription, ...list.filter((s) => s.endpoint !== subscription.endpoint)].slice(0, 10);
  await kvSet(subscriptionsKey(userId), next);
}

export async function removeSubscription(userId: string, endpoint: string) {
  const list = await listSubscriptions(userId);
  await kvSet(
    subscriptionsKey(userId),
    list.filter((s) => s.endpoint !== endpoint),
  );
}

async function pushToDevices(userId: string, payload: Record<string, unknown>) {
  if (!ensureVapid()) return 0;
  const subscriptions = await listSubscriptions(userId);
  let delivered = 0;
  const dead: string[] = [];
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload), {
          TTL: 60 * 60 * 24,
          urgency: "high",
        });
        delivered++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(subscription.endpoint);
        else console.error("[mali] push failed", status, error);
      }
    }),
  );
  if (dead.length) {
    const alive = (await listSubscriptions(userId)).filter((s) => !dead.includes(s.endpoint));
    await kvSet(subscriptionsKey(userId), alive);
  }
  return delivered;
}

export async function notify(
  userId: string,
  input: { kind: NotificationKind; title: string; body: string; url: string; image?: string },
) {
  const notification: AppNotification = {
    id: randomUUID(),
    ...input,
    read: false,
    created_at: new Date().toISOString(),
  };
  const list = await listNotifications(userId);
  const next = [notification, ...list].slice(0, MAX_STORED);
  await kvSet(notificationsKey(userId), next);

  const body = input.body.length > 180 ? `${input.body.slice(0, 177)}…` : input.body;
  const delivered = await pushToDevices(userId, {
    id: notification.id,
    title: input.title,
    body,
    url: input.url,
    badge: next.filter((n) => !n.read).length,
  });
  return { notification, delivered };
}
