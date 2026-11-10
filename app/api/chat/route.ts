import { randomUUID } from "crypto";
import { needsSmartModel, recordExchangeMemory, SMART_MODELS, streamGeminiChat } from "@/lib/ai";
import { extractFollowUps } from "@/lib/followups";
import { loadImages } from "@/lib/images";
import { todaysMaliState } from "@/lib/inner-life";
import { parseReply } from "@/lib/reply-format";
import {
  appendMessages,
  getConversation,
  getMessagesUntil,
  getSnapshotOnOrBefore,
  saveConversation,
} from "@/lib/db";
import { canDraw, drawImage } from "@/lib/drawing";
import { todaysDream } from "@/lib/dreams";
import { withUserLock } from "@/lib/lock";
import { buildChatSystemPrompt, formatMessages } from "@/lib/prompts";
import { claimPendingMessage, getMemory, setPendingMessage } from "@/lib/redis";
import { requireUser } from "@/lib/session";
import type { ChatMessage, Memory } from "@/lib/types";
import { isUuid, titleFromText } from "@/lib/utils";
import { lookupWeb } from "@/lib/web";

function takeId(value: unknown) {
  return typeof value === "string" && isUuid(value) ? value : randomUUID();
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  const fresh = searchParams.get("new") === "1";
  let conversation = conversationId ? await getConversation(user.id, conversationId) : null;

  if (!fresh) {
    // Without an id the visitor is (re)entering the site: open the chat where Mali is waiting for a reply, else a new one.
    const latest = await getConversation(user.id);
    if (!conversationId && latest?.messages.at(-1)?.isInitiation) conversation = latest;
    const takesPending = conversation ? conversation.id === latest?.id : !conversationId;
    if (takesPending) {
      const openId = conversation?.id ?? null;
      conversation = await withUserLock(user.id, async () => {
        const pending = await claimPendingMessage(user.id);
        const current = openId ? await getConversation(user.id, openId) : null;
        if (!pending) return current;
        const initiation: ChatMessage = {
          id: randomUUID(),
          role: "assistant",
          content: pending,
          timestamp: new Date().toISOString(),
          isInitiation: true,
        };
        try {
          return await appendMessages(user.id, [initiation], current?.id);
        } catch (appendError) {
          await setPendingMessage(user.id, pending);
          throw appendError;
        }
      });
    }
  }

  return Response.json({
    messages: conversation?.messages ?? [],
    conversationId: conversation?.id ?? null,
    title: conversation?.title ?? "Новый чат",
    user,
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const text = String(body.message ?? body.content ?? "").trim();
  const targetDate = body.targetDate ? String(body.targetDate) : null;
  const requestedId = body.conversationId ? String(body.conversationId) : null;
  const editMessageId = body.editMessageId ? String(body.editMessageId) : null;
  const assistantMessageId = takeId(body.assistantMessageId);
  const extraPartIds: unknown[] = Array.isArray(body.assistantMessageIds) ? body.assistantMessageIds : [];
  const imageIds: string[] = Array.isArray(body.imageIds)
    ? body.imageIds.filter((id: unknown): id is string => typeof id === "string" && isUuid(id)).slice(0, 4)
    : [];

  if (!text && !imageIds.length) {
    return Response.json({ error: "Пустое сообщение" }, { status: 400 });
  }

  let userMessage: ChatMessage = {
    id: takeId(body.clientMessageId),
    role: "user",
    content: text,
    timestamp: new Date().toISOString(),
    ...(imageIds.length ? { images: imageIds } : {}),
  };

  let memory: Memory;
  let history: ChatMessage[];
  let system: string;
  let conversationId: string | null = null;
  let preservedTitle: string | undefined;

  if (targetDate) {
    const snapshot = await getSnapshotOnOrBefore(user.id, targetDate);
    history = await getMessagesUntil(user.id, targetDate);
    memory = {
      facts: snapshot?.facts ?? [],
      personality_state:
        snapshot?.personality_state ?? (await getMemory(user.id)).personality_state,
      recentTopics: [],
      unresolvedTopics: [],
    };
    system = buildChatSystemPrompt({
      userName: user.name,
      memory,
      historical: { date: snapshot?.date ?? targetDate },
    });
  } else {
    memory = await getMemory(user.id);
    const existing = requestedId ? await getConversation(user.id, requestedId) : null;
    if (editMessageId) {
      if (!existing) return Response.json({ error: "Чат не найден" }, { status: 404 });
      const index = existing.messages.findIndex((message) => message.id === editMessageId);
      const target = index >= 0 ? existing.messages[index] : null;
      if (!target || target.role !== "user") {
        return Response.json({ error: "Сообщение не найдено" }, { status: 404 });
      }
      userMessage = { ...target, content: text, reaction: undefined };
      history = existing.messages.slice(0, index);
      conversationId = existing.id;
      const firstUser = existing.messages.find((message) => message.role === "user");
      const autoTitle = titleFromText(firstUser?.content ?? "");
      const custom =
        Boolean(existing.title) && existing.title !== "Новый чат" && existing.title !== autoTitle;
      preservedTitle =
        !custom && existing.messages.findIndex((message) => message.role === "user") === index
          ? titleFromText(text)
          : existing.title;
    } else {
      history = existing?.messages ?? [];
      conversationId = existing?.id ?? null;
    }
    const [web, dream, self] = await Promise.all([
      text ? lookupWeb(text) : null,
      todaysDream(user.id).catch(() => null),
      todaysMaliState(user.id).catch(() => null),
    ]);
    system = buildChatSystemPrompt({
      userName: user.name,
      memory,
      web,
      dream: dream?.content,
      self,
      canDraw: canDraw(),
    });
  }

  const thread = [...history, userMessage];
  const recentImageIds = thread.slice(-6).flatMap((m) => m.images ?? []);
  const images = recentImageIds.length ? await loadImages(user.id, recentImageIds) : undefined;
  const models = needsSmartModel(text, history) ? SMART_MODELS : undefined;
  const followUps =
    !targetDate && text
      ? extractFollowUps(user.id, text, formatMessages(history, 6)).catch((err) => {
          console.error("Follow-up extraction failed", err);
          return [];
        })
      : null;

  try {
    return streamGeminiChat({
      system,
      messages: thread,
      models,
      images,
      search: false,
      headers: {
        "X-User-Message-Id": userMessage.id,
        ...(conversationId ? { "X-Conversation-Id": conversationId } : {}),
        "Access-Control-Expose-Headers": "X-Conversation-Id, X-User-Message-Id",
      },
      onFinish: async (assistantText) => {
        const { parts, reaction, drawing } = parseReply(assistantText);
        const replyParts: Array<{ id: string; content: string; images?: string[] }> = parts.map(
          (content, i) => ({
            id: i === 0 ? assistantMessageId : takeId(extraPartIds[i]),
            content,
          }),
        );
        if (targetDate) return { reply: { parts: replyParts, reaction } };

        if (drawing) {
          const imageId = await drawImage(user.id, drawing).catch(() => null);
          const last = replyParts[replyParts.length - 1];
          if (imageId) last.images = [imageId];
          else last.content = `${last.content}\n\n(Рисунок не получился — попроси ещё раз чуть позже.)`.trim();
        }

        const base = Date.now();
        const assistants: ChatMessage[] = replyParts.map((part, i) => ({
          id: part.id,
          role: "assistant",
          content: part.content,
          timestamp: new Date(base + i).toISOString(),
          ...(part.images ? { images: part.images } : {}),
        }));
        const finalUser: ChatMessage = reaction ? { ...userMessage, reaction } : userMessage;
        const saved = editMessageId
          ? await withUserLock(user.id, () =>
              saveConversation(
                user.id,
                conversationId as string,
                [...history, finalUser, ...assistants],
                preservedTitle,
              ),
            )
          : await appendMessages(user.id, [finalUser, ...assistants], conversationId);
        void recordExchangeMemory(user.id).catch((err) => console.error("Memory update failed", err));
        if (followUps) await Promise.race([followUps, new Promise((r) => setTimeout(r, 8000))]);
        return { conversationId: saved.id, reply: { parts: replyParts, reaction } };
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обратиться к модели";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!conversationId || !messageId || !content) {
    return Response.json({ error: "Не хватает данных" }, { status: 400 });
  }

  const existing = await getConversation(user.id, conversationId);
  if (!existing) return Response.json({ error: "Чат не найден" }, { status: 404 });
  const index = existing.messages.findIndex((message) => message.id === messageId);
  if (index < 0 || existing.messages[index].role !== "assistant") {
    return Response.json({ error: "Можно править только ответ Мали" }, { status: 404 });
  }

  const messages = existing.messages.map((message, i) =>
    i === index ? { ...message, content } : message,
  );
  const saved = await withUserLock(user.id, () =>
    saveConversation(user.id, conversationId, messages, existing.title),
  );
  return Response.json({ messages: saved.messages, title: saved.title });
}
