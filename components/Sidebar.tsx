"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { IconClose, IconNewChat, IconTrash } from "./Icons";

function groupLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = date.getTime();
  if (t >= startToday) return "Сегодня";
  if (t >= startToday - 86400000) return "Вчера";
  if (t >= startToday - 86400000 * 7) return "За 7 дней";
  if (t >= startToday - 86400000 * 30) return "За 30 дней";
  return "Раньше";
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentId = searchParams.get("c");
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const cancelRename = useRef(false);

  async function load() {
    const res = await fetch("/api/conversations");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.conversations ?? []);
  }

  useEffect(() => {
    if (open) load();
  }, [open, pathname, currentId]);

  useEffect(() => {
    const onUpdate = () => load();
    window.addEventListener("mirror:conversations", onUpdate);
    return () => window.removeEventListener("mirror:conversations", onUpdate);
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, ConversationSummary[]>();
    for (const item of items) {
      const label = groupLabel(item.updated_at);
      const list = map.get(label) ?? [];
      list.push(item);
      map.set(label, list);
    }
    return Array.from(map.entries());
  }, [items]);

  async function remove(id: string) {
    await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
    if (currentId === id) router.push("/chat");
    await load();
  }

  function startRename(item: ConversationSummary) {
    cancelRename.current = false;
    setDraft(item.title || "Новый чат");
    setRenaming(item.id);
  }

  async function commitRename(id: string, original: string) {
    if (cancelRename.current) {
      cancelRename.current = false;
      return;
    }
    const title = draft.trim().slice(0, 80);
    setRenaming(null);
    if (!title || title === original) return;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, title } : item)));
    const res = await fetch("/api/conversations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    });
    if (!res.ok) await load();
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] flex-col bg-[#0b0b0f] shadow-2xl transition-transform",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className="flex items-center justify-between px-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <p className="px-2 font-serif text-xl">Mali</p>
          <button onClick={onClose} className="rounded-lg p-2 text-silver-400" aria-label="Закрыть">
            <IconClose />
          </button>
        </div>

        <Link
          href="/chat?new=1"
          onClick={onClose}
          className="mx-3 mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-silver-100 hover:bg-white/5"
        >
          <IconNewChat className="h-4 w-4" />
          Новый чат
        </Link>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {groups.map(([label, list]) => (
            <div key={label} className="mb-4">
              <p className="px-3 pb-1 text-[11px] uppercase tracking-[0.16em] text-silver-500">{label}</p>
              {list.map((item) => {
                const active = pathname === "/chat" && currentId === item.id;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "group flex items-center rounded-xl pr-1",
                      active ? "bg-white/10" : "hover:bg-white/5",
                    )}
                  >
                    {renaming === item.id ? (
                      <form
                        className="min-w-0 flex-1 px-2 py-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void commitRename(item.id, item.title || "Новый чат");
                        }}
                      >
                        <input
                          autoFocus
                          value={draft}
                          maxLength={80}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void commitRename(item.id, item.title || "Новый чат")}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelRename.current = true;
                              setRenaming(null);
                            }
                          }}
                          className="w-full rounded-lg bg-white/10 px-2 py-1 text-sm text-silver-100 outline-none"
                          aria-label="Название чата"
                        />
                      </form>
                    ) : (
                      <>
                        <Link
                          href={`/chat?c=${item.id}`}
                          onClick={onClose}
                          className="min-w-0 flex-1 truncate px-3 py-2 text-sm text-silver-100"
                        >
                          {item.title || "Новый чат"}
                        </Link>
                        <button
                          onClick={() => startRename(item)}
                          className="rounded-md p-2 text-silver-500 opacity-80 hover:text-silver-100"
                          aria-label="Переименовать чат"
                        >
                          <IconNewChat className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(item.id)}
                          className="rounded-md p-2 text-silver-500 opacity-80 hover:text-silver-100"
                          aria-label="Удалить чат"
                        >
                          <IconTrash />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {!items.length ? (
            <p className="px-3 text-sm text-silver-500">История появится после первого сообщения.</p>
          ) : null}
        </div>

        <div
          className="space-y-1 border-t border-white/10 px-2 pt-2"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {[
            { href: "/notifications", label: "Уведомления" },
            { href: "/reports", label: "Свидетель" },
            { href: "/settings", label: "Настройки" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={cn(
                "block rounded-xl px-3 py-2.5 text-sm",
                pathname === link.href ? "bg-white/10 text-silver-100" : "text-silver-400 hover:bg-white/5",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </aside>
    </>
  );
}
