"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { MemoryCards } from "@/components/MemoryCards";
import { PersonalityChart } from "@/components/PersonalityChart";
import { emptyMemory, type Memory, type MemorySnapshot, type User } from "@/lib/types";

export default function SettingsPage() {
  const [memory, setMemory] = useState<Memory>(emptyMemory());
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState<{ gemini: boolean; kv: boolean; postgres: boolean } | null>(null);
  const [snapshots, setSnapshots] = useState<MemorySnapshot[]>([]);
  const [quota, setQuota] = useState<{
    resetsAt: string;
    models: Array<{ id: string; role: string; daily: number; perMinute: number; used: number; remaining: number }>;
  } | null>(null);

  async function load() {
    const res = await fetch("/api/memory");
    const data = await res.json();
    setMemory(data.memory);
    setUser(data.user);
  }

  useEffect(() => {
    load();
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
    fetch("/api/snapshots")
      .then((r) => r.json())
      .then((data) => setSnapshots(data.snapshots ?? []))
      .catch(() => {});
    fetch("/api/quota")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setQuota(data))
      .catch(() => {});
  }, []);

  async function removeFact(index: number) {
    await fetch(`/api/memory?index=${index}`, { method: "DELETE" });
    await load();
  }

  async function editFact(index: number, text: string) {
    await fetch("/api/memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, text }),
    });
    await load();
  }

  async function snapshot() {
    setStatus("Сохраняю снимок…");
    await fetch("/api/snapshots", { method: "POST" });
    const snaps = await fetch("/api/snapshots").then((r) => r.json());
    setSnapshots(snaps.snapshots ?? []);
    setStatus("Снимок личности сохранён.");
  }

  const p = memory.personality_state;

  return (
    <AuthGate>
      <AppShell title="Настройки">
        <div className="flex h-full min-h-0 flex-col overflow-y-auto px-5 py-5">
          <p className="text-[11px] uppercase tracking-[0.28em] text-ember">Карта отражения</p>
          <h1 className="mt-2 font-serif text-3xl">{user?.name ?? "Настройки"}</h1>
          <p className="mt-2 text-sm leading-6 text-silver-400">
            Параметры нельзя двигать руками — только общением. Здесь можно смотреть, как Мали меняется.
          </p>
          {health && !health.gemini ? (
            <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              Нет ключа Gemini. Добавь GOOGLE_GENERATIVE_AI_API_KEY в .env.local и перезапусти сервер.
            </p>
          ) : null}

          <h2 className="mt-8 font-serif text-2xl">Лимиты</h2>
          <p className="mt-1 text-sm leading-6 text-silver-400">
            Бесплатные запросы Мали за сегодня. Сброс {quota?.resetsAt ?? "около 14:00 по времени Кыргызстана"}.
            Считается только это приложение.
          </p>
          <div className="mt-4 grid gap-2">
            {(quota?.models ?? []).map((model) => (
              <div key={model.id} className="rounded-2xl bg-white/5 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-silver-100">{model.role}</p>
                  <p className="text-sm text-silver-100">
                    {model.remaining} из {model.daily}
                  </p>
                </div>
                <p className="mt-1 text-xs text-silver-500">{model.id}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-ember"
                    style={{ width: `${Math.min(100, (model.used / model.daily) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-silver-500">
                  использовано {model.used} · до {model.perMinute} в минуту
                </p>
              </div>
            ))}
            {!quota ? <p className="text-sm text-silver-500">Считаю лимиты…</p> : null}
          </div>

          <div className="mt-6">
            <PersonalityChart state={p} />
          </div>
          {snapshots.length > 1 ? (
            <div className="mt-4">
              <h2 className="mb-2 text-sm text-silver-400">История эволюции</h2>
              <EvolutionGraph snapshots={snapshots} />
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-silver-400">
            <div className="rounded-2xl bg-white/5 px-3 py-3">
              Сообщений
              <div className="mt-1 text-silver-100">{p.interactionCount}</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-3 py-3">
              Позитивный тон
              <div className="mt-1 text-silver-100">{Math.round(p.positiveRatio * 100)}%</div>
            </div>
          </div>

          <button
            onClick={snapshot}
            className="mt-5 rounded-2xl border border-white/10 py-3 text-sm text-silver-100"
          >
            Сохранить снимок на сегодня
          </button>
          {status ? <p className="mt-2 text-xs text-ember">{status}</p> : null}

          <h2 className="mt-8 font-serif text-2xl">Память</h2>
          <p className="mb-4 mt-1 text-sm text-silver-400">
            Факты, которые Мали уже знает. Из обычных сообщений он их больше не записывает.
          </p>
          <MemoryCards facts={memory.facts} onDelete={removeFact} onEdit={editFact} />
        </div>
      </AppShell>
    </AuthGate>
  );
}

function EvolutionGraph({ snapshots }: { snapshots: MemorySnapshot[] }) {
  const width = 320;
  const height = 90;
  const series = [
    { key: "warmth" as const, color: "#c4a574" },
    { key: "empathy" as const, color: "#d8d3c8" },
    { key: "directness" as const, color: "#7a9bb8" },
  ];

  function pathFor(key: (typeof series)[number]["key"]) {
    return snapshots
      .map((s, i) => {
        const x = (i / Math.max(snapshots.length - 1, 1)) * width;
        const y = height - s.personality_state[key] * height;
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-2xl bg-white/5 p-2">
      {series.map((s) => (
        <path key={s.key} d={pathFor(s.key)} fill="none" stroke={s.color} strokeWidth="2" />
      ))}
    </svg>
  );
}
