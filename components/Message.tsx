"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { IconNewChat } from "./Icons";

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-3" aria-label="Мали печатает">
      <div className="h-7 w-7 shrink-0 rounded-full border border-ember/40 bg-ember/15 text-center text-xs leading-7 text-ember">
        М
      </div>
      <div className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-2.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-silver-400"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
      <span className="text-xs text-silver-500">печатает…</span>
    </div>
  );
}

export function Message({
  message,
  disabled,
  onSave,
}: {
  message: ChatMessage;
  disabled?: boolean;
  onSave?: (message: ChatMessage, content: string) => void;
}) {
  const mine = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  useEffect(() => {
    if (!editing) setDraft(message.content);
  }, [message.content, editing]);

  function cancel() {
    setDraft(message.content);
    setEditing(false);
  }

  function save() {
    const next = draft.trim();
    if (!next || next === message.content.trim()) {
      cancel();
      return;
    }
    setEditing(false);
    onSave?.(message, next);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}
    >
      <div className={`flex max-w-[min(100%,48rem)] gap-3 ${mine ? "flex-row-reverse" : ""}`}>
        {!mine ? (
          <div className="mt-1 h-7 w-7 shrink-0 rounded-full border border-ember/40 bg-ember/15 text-center text-xs leading-7 text-ember">
            М
          </div>
        ) : null}
        <div className={mine ? "flex flex-col items-end" : ""}>
          {!mine && message.isInitiation ? (
            <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-ember">написала первой</p>
          ) : null}
          {message.images?.length ? (
            <div className={`mb-1.5 flex flex-wrap gap-1.5 ${mine ? "justify-end" : ""}`}>
              {message.images.map((id) => (
                <a key={id} href={`/api/images/${id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/images/${id}`}
                    alt="Фото"
                    loading="lazy"
                    className="max-h-64 max-w-[min(70vw,18rem)] rounded-2xl object-cover"
                  />
                </a>
              ))}
            </div>
          ) : null}
          {message.content || editing ? (
          <div
            className={
              mine
                ? "relative rounded-3xl bg-[#2f2f2f] px-4 py-3 text-[15px] leading-6 text-silver-100"
                : "px-1 py-1 text-[15px] leading-7 text-silver-100"
            }
          >
            {editing ? (
              <textarea
                autoFocus
                value={draft}
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                  }
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    save();
                  }
                }}
                className="w-[min(70vw,28rem)] resize-none bg-transparent text-[16px] leading-6 text-silver-100 outline-none"
              />
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
          ) : null}
          {mine && message.reaction ? (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
              className="-mt-2.5 mr-2 rounded-full border border-ink-950 bg-[#3a3a3a] px-1.5 py-0.5 text-sm leading-none"
              aria-label={`Реакция Мали: ${message.reaction}`}
            >
              {message.reaction}
            </motion.span>
          ) : null}
          {editing ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={cancel}
                className="rounded-full px-3 py-1 text-xs text-silver-400"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!draft.trim()}
                className="rounded-full bg-silver-100 px-3 py-1 text-xs text-ink-950 disabled:opacity-40"
              >
                {mine ? "Сохранить и ответить" : "Сохранить"}
              </button>
            </div>
          ) : onSave && !disabled && message.content ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-1 rounded-md p-1 text-silver-500 hover:text-silver-100"
              aria-label="Редактировать сообщение"
            >
              <IconNewChat className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
