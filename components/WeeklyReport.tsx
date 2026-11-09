"use client";

import type { WeeklyReport as WeeklyReportType } from "@/lib/types";
import { formatDateRu } from "@/lib/utils";

export function WeeklyReport({
  report,
  onGenerate,
  loading,
}: {
  report: WeeklyReportType | null;
  onGenerate: () => void;
  loading?: boolean;
}) {
  return (
    <div className="space-y-4">
      <button
        onClick={onGenerate}
        disabled={loading}
        className="w-full rounded-2xl bg-silver-100 py-3 text-sm font-medium text-ink-950 disabled:opacity-60"
      >
        {loading ? "Составляю свидетельство…" : "📊 Отчет за неделю"}
      </button>

      {report ? (
        <article className="glass rounded-3xl p-5">
          <h3 className="font-serif text-2xl leading-8">
            Свидетельство за неделю {formatDateRu(report.week_start)} — {formatDateRu(report.week_end)}
          </h3>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-silver-400">
            <div className="rounded-2xl bg-white/5 px-2 py-3">
              💬
              <div className="mt-1 text-silver-100">{report.stats.messageCount}</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-2 py-3">
              🧠
              <div className="mt-1 text-silver-100">{report.stats.newFactsCount}</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-2 py-3">
              📈
              <div className="mt-1 text-silver-100">{report.stats.emotionalTrend}</div>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-sm leading-6 text-silver-200">
            {report.content.split("\n").filter(Boolean).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </article>
      ) : null}
    </div>
  );
}
