export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-8 text-center">
      <p className="text-[11px] uppercase tracking-[0.3em] text-ember">Mali</p>
      <h1 className="mt-4 font-serif text-4xl">Офлайн</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-silver-400">
        Сети нет, но недавние сообщения остаются в локальном кэше. Открой чат — они подтянутся из IndexedDB.
      </p>
      <a href="/chat" className="mt-8 rounded-full bg-silver-100 px-5 py-2 text-sm text-ink-950">
        К чату
      </a>
    </div>
  );
}
