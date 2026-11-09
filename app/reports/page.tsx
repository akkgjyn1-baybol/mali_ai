"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { WeeklyReport } from "@/components/WeeklyReport";
import type { WeeklyReport as WeeklyReportType } from "@/lib/types";
import { formatDateRu } from "@/lib/utils";

export default function ReportsPage() {
  const [reports, setReports] = useState<WeeklyReportType[]>([]);
  const [current, setCurrent] = useState<WeeklyReportType | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/reports/weekly");
    const data = await res.json();
    setReports(data.reports ?? []);
    setCurrent(data.reports?.[0] ?? null);
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/weekly", { method: "POST" });
      const data = await res.json();
      setCurrent(data.report);
      await load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthGate>
      <AppShell title="Свидетель">
        <div className="flex h-full min-h-0 flex-col overflow-y-auto px-5 py-5">
          <p className="text-[11px] uppercase tracking-[0.28em] text-ember">Зеркало недели</p>
          <h1 className="mt-2 font-serif text-3xl">Аватар как свидетель</h1>
          <p className="mt-2 text-sm leading-6 text-silver-400">
            Без советов. Только факты, повторения и сдвиги тона.
          </p>
          <div className="mt-5">
            <WeeklyReport report={current} onGenerate={generate} loading={loading} />
          </div>
          {reports.length > 1 ? (
            <div className="mt-8 space-y-2">
              <h2 className="text-sm text-silver-400">Предыдущие недели</h2>
              {reports.slice(1).map((report) => (
                <button
                  key={report.id}
                  onClick={() => setCurrent(report)}
                  className="block w-full rounded-2xl border border-white/10 px-4 py-3 text-left text-sm"
                >
                  {formatDateRu(report.week_start)} — {formatDateRu(report.week_end)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </AppShell>
    </AuthGate>
  );
}
