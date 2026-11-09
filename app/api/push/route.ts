import type { PushSubscription } from "web-push";
import {
  listSubscriptions,
  notify,
  removeSubscription,
  saveSubscription,
  vapidPublicKey,
} from "@/lib/notifications";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const subscriptions = await listSubscriptions(user.id);
  return Response.json({ publicKey: vapidPublicKey(), devices: subscriptions.length });
}

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await req.json().catch(() => null);

  if (body?.action === "test") {
    const { delivered } = await notify(user.id, {
      kind: "test",
      title: "Mali",
      body: "Проверка связи. Если ты это видишь — уведомления работают.",
      url: "/notifications",
    });
    return Response.json({ delivered });
  }

  const subscription = body?.subscription as PushSubscription | undefined;
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return Response.json({ error: "Некорректная подписка" }, { status: 400 });
  }
  await saveSubscription(user.id, {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint === "string") await removeSubscription(user.id, body.endpoint);
  return Response.json({ ok: true });
}
