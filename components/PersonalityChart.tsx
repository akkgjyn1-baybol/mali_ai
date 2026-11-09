"use client";

import type { PersonalityState } from "@/lib/types";

const axes = [
  { key: "warmth", label: "Близость" },
  { key: "directness", label: "Прямота" },
  { key: "formality", label: "Формальность" },
  { key: "empathy", label: "Эмпатия" },
] as const;

export function PersonalityChart({ state }: { state: PersonalityState }) {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 90;
  const points = axes.map((axis, i) => {
    const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    const value = state[axis.key];
    return {
      ...axis,
      value,
      x: cx + Math.cos(angle) * radius * value,
      y: cy + Math.sin(angle) * radius * value,
      lx: cx + Math.cos(angle) * (radius + 28),
      ly: cy + Math.sin(angle) * (radius + 28),
    };
  });
  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-64 w-64">
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon
            key={r}
            points={axes
              .map((_, i) => {
                const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
                return `${cx + Math.cos(angle) * radius * r},${cy + Math.sin(angle) * radius * r}`;
              })
              .join(" ")}
            fill="none"
            stroke="rgba(244,241,234,0.12)"
          />
        ))}
        {points.map((p) => (
          <line
            key={p.key}
            x1={cx}
            y1={cy}
            x2={cx + ((p.lx - cx) * radius) / (radius + 28)}
            y2={cy + ((p.ly - cy) * radius) / (radius + 28)}
            stroke="rgba(244,241,234,0.16)"
          />
        ))}
        <polygon points={polygon} fill="rgba(196,165,116,0.28)" stroke="#c4a574" />
        {points.map((p) => (
          <text
            key={p.key}
            x={p.lx}
            y={p.ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#d8d3c8"
            fontSize="11"
          >
            {p.label}
          </text>
        ))}
      </svg>
      <div className="mt-2 grid w-full grid-cols-2 gap-2 text-xs text-silver-400">
        {points.map((p) => (
          <div key={p.key} className="flex justify-between rounded-xl bg-white/5 px-3 py-2">
            <span>{p.label}</span>
            <span className="text-silver-100">{p.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
