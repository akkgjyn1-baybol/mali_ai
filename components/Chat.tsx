"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { shrinkImage } from "@/lib/image-client";
import { cacheMessages, loadCachedMessages } from "@/lib/indexeddb";
import { parseReply, typingDelayMs } from "@/lib/reply-format";
import { readTextStream, type ReplyMeta } from "@/lib/stream";
import type { ChatMessage, User } from "@/lib/types";
import { Message, TypingIndicator } from "./Message";
import { MessageInput, type Attachment } from "./MessageInput";

export function Chat() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationId = searchParams.get("c");
  const isNew = searchParams.get("new") === "1";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(conversationId);
  const scroller = useRef<HTMLDivElement>(null);
  const skipLoadFor = useRef<string | null>(null);
  const epoch = useRef(0);
  const busyRef = useRef(false);
  const readyRef = useRef(false);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    });
  };

  const load = useCallback(async (id: string | null) => {
    const token = ++epoch.current;
    readyRef.current = false;
    setReady(false);
    busyRef.current = false;
    setBusy(false);
    setError("");

    try {
      const setup = await fetch("/api/setup").then((r) => r.json());
      if (token !== epoch.current) return;

      if (setup.user?.id && id) {
        try {
          const cached = await loadCachedMessages(setup.user.id, id);
          if (token !== epoch.current) return;
          if (cached.length) setMessages(cached);
        } catch {
          if (token !== epoch.current) return;
          setMessages([]);
        }
      } else if (token === epoch.current) {
        setMessages([]);
      }

      const res = await fetch(
        id ? `/api/chat?conversationId=${id}` : isNew ? "/api/chat?new=1" : "/api/chat",
      );
      if (token !== epoch.current) return;
      if (!res.ok) throw new Error("Не удалось загрузить чат");
      const data = await res.json();
      if (token !== epoch.current) return;
      setUser(data.user);
      setMessages(data.messages ?? []);
      setActiveId(data.conversationId ?? id);
      if (data.user?.id && data.conversationId) {
        await cacheMessages(data.user.id, data.conversationId, data.messages ?? []);
      }
      if (token !== epoch.current) return;
      if (data.conversationId && !id) {
        skipLoadFor.current = data.conversationId;
        setActiveId(data.conversationId);
        router.replace(`/chat?c=${data.conversationId}`);
      }
      window.dispatchEvent(new Event("mirror:conversations"));
    } catch (err) {
      if (token === epoch.current) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить чат");
      }
    } finally {
      if (token === epoch.current) {
        readyRef.current = true;
        setReady(true);
      }
    }
  }, [router, isNew]);

  useEffect(() => {
    if (conversationId && skipLoadFor.current === conversationId) return;
    if (skipLoadFor.current && skipLoadFor.current !== conversationId) {
      skipLoadFor.current = null;
    }
    load(conversationId);
  }, [conversationId, isNew, load]);

  useEffect(() => {
    const refresh = () => {
      if (busyRef.current || !readyRef.current || !activeId) return;
      load(activeId);
    };
    window.addEventListener("mali:push", refresh);
    return () => window.removeEventListener("mali:push", refresh);
  }, [activeId, load]);

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, busy]);

  async function streamReply(params: {
    token: number;
    prior: ChatMessage[];
    thread: ChatMessage[];
    draft: ChatMessage;
    body: Record<string, unknown>;
    restoreInput?: string;
  }) {
    const { token, prior, thread, draft, body, restoreInput } = params;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (token !== epoch.current) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Ошибка запроса" }));
        throw new Error(data.error || `Ошибка ${res.status}`);
      }

      const result = await readTextStream(res, () => {});
      if (token !== epoch.current) return;

      const parsed = parseReply(result.text);
      const reply: ReplyMeta = result.reply ?? {
        reaction: parsed.reaction,
        parts: parsed.parts.map((content, i) => ({
          id: i === 0 ? draft.id : crypto.randomUUID(),
          content,
        })),
      };
      const lastUser = thread[thread.length - 1];
      const reacted =
        reply.reaction && lastUser?.role === "user"
          ? [...thread.slice(0, -1), { ...lastUser, reaction: reply.reaction }]
          : thread;

      let finalThread = reacted;
      for (let i = 0; i < reply.parts.length; i++) {
        const part = reply.parts[i];
        if (i > 0) {
          setMessages(finalThread);
          await sleep(typingDelayMs(part.content));
          if (token !== epoch.current) return;
        }
        finalThread = [
          ...finalThread,
          {
            ...draft,
            id: part.id,
            content: part.content,
            timestamp: new Date().toISOString(),
            ...(part.images?.length ? { images: part.images } : {}),
          },
        ];
        setMessages(finalThread);
      }

      let createdId = result.conversationId || res.headers.get("X-Conversation-Id");
      if (!createdId) {
        const list = await fetch("/api/conversations").then((r) => r.json());
        createdId = list.conversations?.[0]?.id ?? null;
      }
      if (token !== epoch.current) return;
      const id = createdId || activeId;
      if (id && id !== activeId) {
        skipLoadFor.current = id;
        setActiveId(id);
        router.replace(`/chat?c=${id}`);
      }
      if (user?.id && id) await cacheMessages(user.id, id, finalThread);
      window.dispatchEvent(new Event("mirror:conversations"));
    } catch (err) {
      if (token === epoch.current) {
        setMessages(prior);
        if (restoreInput !== undefined) setInput(restoreInput);
        setError(err instanceof Error ? err.message : "Не удалось получить ответ");
      }
    } finally {
      if (token === epoch.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function attach(files: File[]) {
    setError("");
    const room = 4 - attachments.length;
    for (const file of files.slice(0, room)) {
      const localId = crypto.randomUUID();
      try {
        const dataUrl = await shrinkImage(file);
        setAttachments((prev) => [...prev, { localId, preview: dataUrl, id: null }]);
        const res = await fetch("/api/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Не удалось загрузить фото");
        setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, id: data.id } : a)));
      } catch (err) {
        setAttachments((prev) => prev.filter((a) => a.localId !== localId));
        setError(err instanceof Error ? err.message : "Не удалось загрузить фото");
      }
    }
  }

  async function send() {
    const text = input.trim();
    const imageIds = attachments.map((a) => a.id).filter((id): id is string => Boolean(id));
    if (attachments.some((a) => !a.id)) return;
    if ((!text && !imageIds.length) || !readyRef.current || busyRef.current) return;
    const prior = messages;
    const token = ++epoch.current;
    busyRef.current = true;
    setInput("");
    setAttachments([]);
    setError("");
    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      ...(imageIds.length ? { images: imageIds } : {}),
    };
    const assistantId = crypto.randomUUID();
    const thread = [...prior, optimistic];
    const draft: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };
    setMessages(thread);
    setBusy(true);
    await streamReply({
      token,
      prior,
      thread,
      draft,
      restoreInput: text,
      body: {
        message: text,
        imageIds,
        conversationId: activeId,
        clientMessageId: optimistic.id,
        assistantMessageId: assistantId,
      },
    });
  }

  async function saveEdit(message: ChatMessage, content: string) {
    if (!activeId || !readyRef.current || busyRef.current) return;
    const prior = messages;

    if (message.role === "assistant") {
      const next = messages.map((item) => (item.id === message.id ? { ...item, content } : item));
      setMessages(next);
      setError("");
      try {
        const res = await fetch("/api/chat", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeId, messageId: message.id, content }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Не удалось сохранить правку" }));
          throw new Error(data.error || "Не удалось сохранить правку");
        }
        if (user?.id) await cacheMessages(user.id, activeId, next);
        window.dispatchEvent(new Event("mirror:conversations"));
      } catch (err) {
        setMessages(prior);
        setError(err instanceof Error ? err.message : "Не удалось сохранить правку");
      }
      return;
    }

    const index = messages.findIndex((item) => item.id === message.id);
    if (index < 0) return;
    const token = ++epoch.current;
    busyRef.current = true;
    setError("");
    const edited: ChatMessage = { ...message, content, reaction: undefined };
    const thread = [...messages.slice(0, index), edited];
    const assistantId = crypto.randomUUID();
    const draft: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };
    setMessages(thread);
    setBusy(true);
    await streamReply({
      token,
      prior,
      thread,
      draft,
      body: {
        message: content,
        conversationId: activeId,
        editMessageId: message.id,
        assistantMessageId: assistantId,
      },
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="font-serif text-3xl text-silver-100">Чем заняться сегодня?</p>
            </div>
          ) : (
            messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                disabled={busy || !ready || !activeId}
                onSave={saveEdit}
              />
            ))
          )}
          {busy ? <TypingIndicator /> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </div>
      </div>

      <MessageInput
        value={input}
        onChange={setInput}
        onSubmit={send}
        disabled={busy || !ready}
        attachments={attachments}
        onAttach={attach}
        onRemoveAttachment={(localId) =>
          setAttachments((prev) => prev.filter((a) => a.localId !== localId))
        }
      />
    </div>
  );
}
