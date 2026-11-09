"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { IconBell, IconMenu, IconNewChat } from "./Icons";
import { Sidebar } from "./Sidebar";

function useUnreadCount() {
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (alive && data) setUnread(data.unread ?? 0);
        })
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    window.addEventListener("mali:push", load);
    window.addEventListener("mali:notifications-read", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("mali:push", load);
      window.removeEventListener("mali:notifications-read", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return unread;
}

function AppShellInner({
  children,
  title = "Mali",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isChat = pathname === "/chat";
  const unread = useUnreadCount();

  return (
    <div className="flex w-full flex-col bg-ink-950" style={{ height: "var(--vvh)" }}>
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <header
        className="relative flex items-center justify-between border-b border-white/5 px-1"
        style={{ paddingTop: "max(0.25rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-3 text-silver-100"
          aria-label="Меню"
        >
          <IconMenu />
        </button>
        <h1 className="pointer-events-none absolute inset-x-0 mx-auto max-w-[50%] truncate text-center text-sm font-medium text-silver-100">
          {title}
        </h1>
        <div className="flex items-center">
          <Link
            href="/notifications"
            className={cn(
              "relative rounded-lg p-3",
              pathname === "/notifications" ? "text-ember" : "text-silver-100",
            )}
            aria-label="Уведомления"
          >
            <IconBell />
            {unread > 0 ? (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-semibold leading-none text-ink-950">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Link>
          {isChat ? (
            <button
              onClick={() => router.push("/chat?new=1")}
              className="rounded-lg p-3 text-silver-100"
              aria-label="Новый чат"
            >
              <IconNewChat />
            </button>
          ) : null}
        </div>
      </header>
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center text-silver-400" style={{ height: "var(--vvh)" }}>
          Mali
        </div>
      }
    >
      <AppShellInner title={title}>{children}</AppShellInner>
    </Suspense>
  );
}
