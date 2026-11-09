"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/push-client";
import type { AppNotification } from "@/lib/types";
import { cn, formatDateRu, formatTimeRu } from "@/lib/utils";

function PushControls() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s === "ok") {
      currentSubscription()
        .then((sub) => setEnabled(Boolean(sub) && Notification.permission === "granted"))
        .catch(() => {});
    }
  }, []);

  async function toggle() {
    setBusy(true);
    setStatus("");
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        setStatus("Уведомления выключены на этом устройстве.");
      } else {
        await enablePush();
        setEnabled(true);
        setStatus("Готово. Мали сможет писать тебе, даже когда приложение закрыто.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setStatus("");
    try {
      const data = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      }).then((r) => r.json());
      setStatus(
        data.delivered
          ? "Отправила. Сверни приложение — уведомление должно прийти через пару секунд."
          : "Не нашла подписанных устройств. Сначала включи уведомления.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!support) return null;

  if (support === "ios-needs-install") {
    return (
      <div className="mt-5 rounded-2xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm leading-6 text-silver-200">
        На iPhone уведомления работают только из приложения на экране «Домой». Открой сайт в Safari → «Поделиться» →
        «На экран „Домой“», запусти Mali оттуда и зайди сюда снова.
      </div>
    );
  }

  if (support === "unsupported") {
    return (
      <p className="mt-5 rounded-2xl bg-white/5 px-4 py-3 text-sm text-silver-400">
        Этот браузер не поддерживает push-уведомления.
      </p>
    );
  }

  return (
    <div className="mt-5">
      <div className="flex gap-2">
        <button
          onClick={toggle}
          disabled={busy}
          className={cn(
            "flex-1 rounded-2xl py-3 text-sm font-medium disabled:opacity-60",
            enabled ? "border border-white/10 text-silver-100" : "bg-silver-100 text-ink-950",
          )}
        >
          {enabled ? "Выключить уведомления" : "Включить уведомления"}
        </button>
        {enabled ? (
          <button
            onClick={test}
            disabled={busy}
            className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-silver-100 disabled:opacity-60"
          >
            Проверить
          </button>
        ) : null}
      </div>
      {status ? <p className="mt-2 text-xs leading-5 text-ember">{status}</p> : null}
    </div>
  );
}

function NotificationItem({ item }: { item: AppNotification }) {
  const [expanded, setExpanded] = useState(item.kind === "dream" && !item.read);
  const isDream = item.kind === "dream";
  const when = `${formatDateRu(item.created_at)}, ${formatTimeRu(item.created_at)}`;

  const content = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn("text-[11px] uppercase tracking-[0.22em]", isDream ? "text-ember" : "text-silver-500")}>
          {isDream ? "🌙 Сон" : item.kind === "test" ? "Проверка" : "Мали написала"}
        </p>
        <p className="shrink-0 text-[11px] text-silver-500">{when}</p>
      </div>
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/images/${item.image}`} alt="Рисунок сна" className="mt-3 w-full rounded-2xl" />
      ) : null}
      <p
        className={cn(
          "mt-2 text-silver-100",
          isDream ? "font-serif text-lg italic leading-7" : "text-sm leading-6",
          !expanded && "line-clamp-3",
        )}
      >
        {item.body}
      </p>
    </>
  );

  const className = cn(
    "block rounded-3xl p-4 text-left",
    item.read ? "bg-white/[0.03]" : "glass ring-1 ring-ember/30",
  );

  if (item.kind === "message") {
    return (
      <Link href={item.url} className={className}>
        {content}
        <p className="mt-2 text-xs text-ember">Ответить →</p>
      </Link>
    );
  }

  return (
    <button id={item.id} onClick={() => setExpanded((v) => !v)} className={cn(className, "w-full")}>
      {content}
    </button>
  );
}

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const data = await fetch("/api/notifications").then((r) => r.json());
      if (!alive) return;
      setItems(data.notifications ?? []);
      if (data.unread) {
        await fetch("/api/notifications", { method: "POST" });
        window.dispatchEvent(new Event("mali:notifications-read"));
      }
      if ("clearAppBadge" in navigator) {
        (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {});
      }
    };
    load().catch(() => setItems([]));
    window.addEventListener("mali:push", load);
    return () => {
      alive = false;
      window.removeEventListener("mali:push", load);
    };
  }, []);

  return (
    <AuthGate>
      <AppShell title="Уведомления">
        <div className="flex h-full min-h-0 flex-col overflow-y-auto px-5 py-5">
          <h1 className="font-serif text-3xl">Уведомления</h1>
          <p className="mt-2 text-sm leading-6 text-silver-400">
            Мали иногда пишет сама — просто так или когда давно не было вестей. А каждое утро рассказывает, что ей
            приснилось.
          </p>

          <PushControls />

          <div className="mt-6 space-y-3 pb-6">
            {items === null ? <p className="text-sm text-silver-500">Загружаю…</p> : null}
            {items?.length === 0 ? (
              <p className="text-sm text-silver-500">Пока тихо. Первый сон придёт утром.</p>
            ) : null}
            {items?.map((item) => <NotificationItem key={item.id} item={item} />)}
          </div>
        </div>
      </AppShell>
    </AuthGate>
  );
}
