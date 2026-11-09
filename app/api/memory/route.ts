import { withUserLock } from "@/lib/lock";
import { getMemory, setMemory } from "@/lib/redis";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const memory = await getMemory(user.id);
  return Response.json({ memory, user });
}

export async function PATCH(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await req.json();
  const memory = await withUserLock(user.id, async () => {
    const latest = await getMemory(user.id);
    if (body.index != null && typeof body.text === "string") {
      const index = Number(body.index);
      if (latest.facts[index]) {
        latest.facts[index] = {
          ...latest.facts[index],
          text: body.text.trim(),
        };
      }
    }
    if (Array.isArray(body.unresolvedTopics)) {
      latest.unresolvedTopics = body.unresolvedTopics.map(String);
    }
    await setMemory(user.id, latest);
    return latest;
  });
  return Response.json({ memory });
}

export async function DELETE(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const index = Number(searchParams.get("index"));
  const memory = await withUserLock(user.id, async () => {
    const latest = await getMemory(user.id);
    if (!Number.isNaN(index)) {
      latest.facts.splice(index, 1);
      await setMemory(user.id, latest);
    }
    return latest;
  });
  return Response.json({ memory });
}
