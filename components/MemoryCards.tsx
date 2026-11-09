"use client";

import { useState } from "react";
import type { Fact } from "@/lib/types";
import { formatDateRu } from "@/lib/utils";

export function MemoryCards({
  facts,
  onDelete,
  onEdit,
}: {
  facts: Fact[];
  onDelete?: (index: number) => void;
  onEdit?: (index: number, text: string) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  if (!facts.length) {
    return (
      <p className="text-sm leading-6 text-silver-400">
        Память пока пуста. Мали не добавляет факты из каждого сообщения.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {facts
        .slice()
        .reverse()
        .map((fact, reversedIndex) => {
          const index = facts.length - 1 - reversedIndex;
          return (
            <article key={`${fact.text}-${index}`} className="glass rounded-2xl px-4 py-3">
              {editing === index ? (
                <div className="space-y-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-full rounded-xl bg-black/30 p-2 text-sm outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      className="rounded-full bg-silver-100 px-3 py-1 text-xs text-ink-950"
                      onClick={() => {
                        onEdit?.(index, draft);
                        setEditing(null);
                      }}
                    >
                      Сохранить
                    </button>
                    <button className="text-xs text-silver-400" onClick={() => setEditing(null)}>
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm leading-6 text-silver-100">{fact.text}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-silver-500">
                    <span>
                      {formatDateRu(fact.date)} · уверенность {fact.confidence.toFixed(2)}
                    </span>
                    <span className="flex gap-3">
                      {onEdit ? (
                        <button
                          onClick={() => {
                            setEditing(index);
                            setDraft(fact.text);
                          }}
                        >
                          изменить
                        </button>
                      ) : null}
                      {onDelete ? <button onClick={() => onDelete(index)}>удалить</button> : null}
                    </span>
                  </div>
                </>
              )}
            </article>
          );
        })}
    </div>
  );
}
