import { listNotifications, markAllRead } from "@/lib/notifications";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const notifications = await listNotifications(user.id);
  return Response.json({
    notifications,
    unread: notifications.filter((n) => !n.read).length,
  });
}

export async function POST() {
  const { user, error } = await requireUser();
  if (error) return error;
  const notifications = await markAllRead(user.id);
  return Response.json({ notifications, unread: 0 });
}
