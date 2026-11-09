import { randomUUID } from "crypto";
import { assertCronAuth } from "@/lib/cron-auth";
import { insertSnapshot, listUsers } from "@/lib/db";
import { getMemory } from "@/lib/redis";
import { todayDate } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const unauthorized = assertCronAuth(req);
  if (unauthorized) return unauthorized;

  const users = await listUsers();
  const date = todayDate();
  let count = 0;

  for (const user of users) {
    const memory = await getMemory(user.id);
    await insertSnapshot({
      id: randomUUID(),
      user_id: user.id,
      date,
      personality_state: memory.personality_state,
      facts: memory.facts,
      message_count: memory.personality_state.interactionCount,
      created_at: new Date().toISOString(),
    });
    count += 1;
  }

  return Response.json({ success: true, count });
}
