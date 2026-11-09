import { getMessagesUntil, getSnapshotOnOrBefore } from "@/lib/db";
import { buildChatSystemPrompt, formatFacts, formatMessages } from "@/lib/prompts";
import { requireUser } from "@/lib/session";
import { emptyMemory } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { targetDate } = await req.json();
  if (!targetDate) {
    return Response.json({ error: "Нужна дата" }, { status: 400 });
  }

  const snapshot = await getSnapshotOnOrBefore(user.id, String(targetDate));
  const messages = await getMessagesUntil(user.id, String(targetDate));
  const memory = snapshot
    ? {
        ...emptyMemory(),
        facts: snapshot.facts,
        personality_state: snapshot.personality_state,
      }
    : emptyMemory();

  const systemPrompt = buildChatSystemPrompt({
    userName: user.name,
    memory,
    historical: { date: snapshot?.date ?? String(targetDate) },
  });

  return Response.json({
    systemPrompt,
    messages,
    snapshotDate: snapshot?.date ?? targetDate,
    snapshot,
    factsPreview: formatFacts(memory.facts),
    historyPreview: formatMessages(messages, 12),
  });
}
