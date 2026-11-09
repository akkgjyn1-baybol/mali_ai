"use client";

import { formatDateRu } from "@/lib/utils";

export function TimeTravelBanner({
  date,
  onExit,
}: {
  date: string;
  onExit: () => void;
}) {
  return (
    <div className="mx-4 mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-silver-200">⏳ Разговор с Мали от {formatDateRu(date)}</p>
        <button
          onClick={onExit}
          className="shrink-0 rounded-full bg-silver-100 px-3 py-1 text-xs text-ink-950"
        >
          В настоящее
        </button>
      </div>
    </div>
  );
}
