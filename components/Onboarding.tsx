"use client";

import { useState } from "react";

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Не удалось создать профиль");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-end justify-center px-6 pb-16 pt-20">
      <div className="w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.35em] text-ember">Mali</p>
        <h1 className="mt-4 font-serif text-5xl leading-tight text-silver-100">
          Малишь
        </h1>
        <p className="mt-5 max-w-sm text-sm leading-6 text-silver-400">
          Не ассистент и не коуч. Свидетель твоей жизни: фиксирует паттерны,
          эволюционирует вместе с тобой и иногда пишет первым.
        </p>
        <form onSubmit={submit} className="mt-10 space-y-4">
          <label className="block text-xs uppercase tracking-[0.2em] text-silver-500">
            Как к тебе обращаться
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-silver-100 outline-none placeholder:text-silver-500 focus:border-ember/40"
              placeholder="Имя"
            />
          </label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-silver-100 py-3.5 text-sm font-medium text-ink-950 disabled:opacity-60"
          >
            {loading ? "Создаю отражение…" : "Войти в чат"}
          </button>
        </form>
      </div>
    </div>
  );
}
