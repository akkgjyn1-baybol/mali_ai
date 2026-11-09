import { randomUUID } from "crypto";
import { insertSnapshot, listSnapshots } from "@/lib/db";
import { getMemory } from "@/lib/redis";
import { requireUser } from "@/lib/session";
import { todayDate } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const snapshots = await listSnapshots(user.id);
  return Response.json({ snapshots });
}

export async function POST() {
  const { user, error } = await requireUser();
  if (error) return error;
  const memory = await getMemory(user.id);
  const snapshot = {
    id: randomUUID(),
    user_id: user.id,
    date: todayDate(),
    personality_state: memory.personality_state,
    facts: memory.facts,
    message_count: memory.personality_state.interactionCount,
    created_at: new Date().toISOString(),
  };
  await insertSnapshot(snapshot);
  const snapshots = await listSnapshots(user.id);
  return Response.json({ snapshot, snapshots });
}
