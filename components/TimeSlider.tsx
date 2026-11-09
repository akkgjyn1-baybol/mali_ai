"use client";

import { useEffect, useMemo, useState } from "react";
import type { MemorySnapshot } from "@/lib/types";
import { formatDateRu, todayDate } from "@/lib/utils";

export function TimeSlider({
  snapshots,
  selectedDate,
  onChange,
}: {
  snapshots: MemorySnapshot[];
  selectedDate: string | null;
  onChange: (date: string | null) => void;
}) {
  const dates = useMemo(() => {
    const list = snapshots.map((s) => s.date);
    const today = todayDate();
    if (!list.includes(today)) list.push(today);
    return Array.from(new Set(list)).sort();
  }, [snapshots]);

  const [index, setIndex] = useState(Math.max(dates.length - 1, 0));

  useEffect(() => {
    if (!selectedDate) setIndex(Math.max(dates.length - 1, 0));
  }, [dates.length, selectedDate]);

  if (dates.length < 2) {
    return (
      <p className="text-sm text-silver-400">
        Снимки появятся после первого дня общения. Можно создать снимок сегодня в настройках.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="range"
        min={0}
        max={dates.length - 1}
        value={index}
        onChange={(e) => {
          const next = Number(e.target.value);
          setIndex(next);
          const date = dates[next];
          if (date === dates.at(-1)) onChange(null);
          else onChange(date);
        }}
        className="w-full accent-ember"
      />
      <p className="text-sm text-silver-200">
        {dates[index] === dates.at(-1) ? "Настоящее" : formatDateRu(dates[index])}
      </p>
    </div>
  );
}
