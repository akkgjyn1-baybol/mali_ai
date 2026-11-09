import { createUser, getUser } from "@/lib/db";
import { emptyMemory } from "@/lib/types";
import { setMemory } from "@/lib/redis";
import { getSessionUserId, setUserCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const id = await getSessionUserId();
  if (!id) return Response.json({ user: null });
  const user = await getUser(id);
  return Response.json({ user });
}

export async function POST(req: Request) {
  const existingId = await getSessionUserId();
  if (existingId) {
    const existing = await getUser(existingId);
    if (existing) return Response.json({ user: existing });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim() || "Я";
  const user = await createUser(name);
  await setMemory(user.id, emptyMemory());
  setUserCookie(user.id);
  return Response.json({ user });
}
