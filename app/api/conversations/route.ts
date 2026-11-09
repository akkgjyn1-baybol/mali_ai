import { createConversation, deleteConversation, listConversations, renameConversation } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const conversations = await listConversations(user.id);
  return Response.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updated_at: c.updated_at,
      preview: c.messages.at(-1)?.content?.slice(0, 80) ?? "",
    })),
  });
}

export async function POST() {
  const { user, error } = await requireUser();
  if (error) return error;
  const conversation = await createConversation(user.id);
  return Response.json({ conversation });
}

export async function PATCH(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!id || !title) return Response.json({ error: "Нужны id и название" }, { status: 400 });
  try {
    const conversation = await renameConversation(user.id, id, title);
    return Response.json({
      conversation: { id: conversation.id, title: conversation.title, updated_at: conversation.updated_at },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось переименовать";
    const status = message === "Чат не найден" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Нет id" }, { status: 400 });
  await deleteConversation(user.id, id);
  return Response.json({ ok: true });
}
