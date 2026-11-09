"use client";

import { useRef } from "react";
import { IconClose, IconImage, IconSend } from "./Icons";

export type Attachment = { localId: string; preview: string; id: string | null };

export function MessageInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Спроси что-нибудь",
  attachments = [],
  onAttach,
  onRemoveAttachment,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  attachments?: Attachment[];
  onAttach?: (files: File[]) => void;
  onRemoveAttachment?: (localId: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = attachments.some((a) => !a.id);
  const canSend = !disabled && !uploading && (value.trim().length > 0 || attachments.length > 0);

  return (
    <form
      className="mx-auto w-full max-w-3xl px-3 pt-2"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <div className="rounded-[28px] border border-white/10 bg-[#303030] p-2 shadow-[0_-12px_40px_rgba(0,0,0,0.35)]">
        {attachments.length ? (
          <div className="flex gap-2 px-1 pb-2 pt-1">
            {attachments.map((a) => (
              <div key={a.localId} className="relative h-16 w-16 overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.preview} alt="" className={`h-full w-full object-cover ${a.id ? "" : "opacity-50"}`} />
                <button
                  type="button"
                  onClick={() => onRemoveAttachment?.(a.localId)}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-silver-100"
                  aria-label="Убрать фото"
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-1">
          {onAttach ? (
            <>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={disabled || attachments.length >= 4}
                className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full text-silver-400 hover:text-silver-100 disabled:opacity-40"
                aria-label="Прикрепить фото"
              >
                <IconImage />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) onAttach(files);
                }}
              />
            </>
          ) : null}
          <textarea
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSubmit();
              }
            }}
            placeholder={placeholder}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[16px] leading-5 text-silver-100 outline-none placeholder:text-silver-500"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-silver-100 text-ink-950 disabled:bg-white/20 disabled:text-silver-500"
            aria-label="Отправить"
          >
            <IconSend />
          </button>
        </div>
      </div>
    </form>
  );
}
